// Labo — moteur natif : micro + retour écouteurs en basse latence (Oboe / AAudio)
#include <jni.h>
#include <oboe/Oboe.h>
#include <android/log.h>
#include <atomic>
#include <vector>
#include <cmath>
#include <mutex>
#include <algorithm>
#include <thread>
#include <oboe/LatencyTuner.h>

#define LOG(...) __android_log_print(ANDROID_LOG_INFO, "LaboAudio", __VA_ARGS__)

class Engine : public oboe::AudioStreamDataCallback, public oboe::AudioStreamErrorCallback {
public:
    std::shared_ptr<oboe::AudioStream> out, in;
    std::atomic<bool> monitor{false}, recording{false}, isOpen{false};
    std::atomic<float> vol{0.9f}, lvl{0.f}, pk{0.f};
    std::vector<int16_t> rec;
    std::atomic<int> recN{0};
    std::vector<float> inBuf;
    int outCh = 2, sr = 48000;
    float gainNow = 0.f;
    std::mutex lock;
    std::atomic<bool> wanted{false};
    std::unique_ptr<oboe::LatencyTuner> tuner;
    /* file d'attente entre le micro et les écouteurs : rien n'est jamais jeté ni sauté */
    static const int FIFO = 1 << 15;
    std::vector<float> fifo = std::vector<float>(FIFO, 0.f);
    int64_t fw = 0, fr = 0;      // positions écriture / lecture (le même fil fait les deux)
    bool primed = false; int inBurst = 192; int extra = 0; int calm = 0; float fadeOut = 0.f, lastOut = 0.f;
    std::vector<float> tmp;

    bool open() {
        std::lock_guard<std::mutex> g(lock);
        if (isOpen) return true;
        if (rec.empty()) rec.assign(48000 * 60 * 5, 0);  // 5 minutes de prise
        oboe::AudioStreamBuilder ob;
        ob.setDirection(oboe::Direction::Output)
            ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
            ->setSharingMode(oboe::SharingMode::Shared)
            ->setFormat(oboe::AudioFormat::Float)
            ->setChannelCount(2)
            ->setUsage(oboe::Usage::Game)
            ->setDataCallback(this)
            ->setErrorCallback(this);
        ob.setSharingMode(oboe::SharingMode::Exclusive);
        if (ob.openStream(out) != oboe::Result::OK) { ob.setSharingMode(oboe::SharingMode::Shared); if (ob.openStream(out) != oboe::Result::OK) { LOG("sortie impossible"); return false; } }
        sr = out->getSampleRate(); outCh = out->getChannelCount();
        out->setBufferSizeInFrames(out->getFramesPerBurst());   // un seul paquet : le minimum possible
        tuner.reset(new oboe::LatencyTuner(*out));  // ne l'agrandit que s'il y a vraiment une coupure

        oboe::AudioStreamBuilder ib;
        ib.setDirection(oboe::Direction::Input)
            ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
            ->setSharingMode(oboe::SharingMode::Shared)
            ->setFormat(oboe::AudioFormat::Float)
            ->setChannelCount(1)
            ->setSampleRate(sr)
            ->setSampleRateConversionQuality(oboe::SampleRateConversionQuality::Medium)
            ->setFormatConversionAllowed(true)
            ->setChannelConversionAllowed(true)
            ->setInputPreset(oboe::InputPreset::VoicePerformance);
        ib.setSharingMode(oboe::SharingMode::Exclusive);
        oboe::Result r = ib.openStream(in);
        if (r != oboe::Result::OK) { ib.setSharingMode(oboe::SharingMode::Shared); r = ib.openStream(in); }
        if (r != oboe::Result::OK) { ib.setInputPreset(oboe::InputPreset::Unprocessed); r = ib.openStream(in); }
        if (r != oboe::Result::OK) { ib.setInputPreset(oboe::InputPreset::Generic); r = ib.openStream(in); }
        if (r != oboe::Result::OK) { LOG("micro impossible"); out->close(); out.reset(); return false; }
        inBuf.assign(8192, 0.f); tmp.assign(8192, 0.f);
        inBurst = std::max(64, in->getFramesPerBurst());
        fw = fr = 0; primed = false; gainNow = 0.f; extra = 0; calm = 0;
        in->requestStart();
        out->requestStart();
        isOpen = true; wanted = true;
        LOG("ouvert : %d Hz, burst %d", sr, out->getFramesPerBurst());
        return true;
    }

    void close() {
        std::lock_guard<std::mutex> g(lock);
        recording = false; monitor = false; wanted = false;
        if (out) { out->stop(); out->close(); out.reset(); }
        if (in) { in->stop(); in->close(); in.reset(); }
        isOpen = false;
    }

    oboe::DataCallbackResult onAudioReady(oboe::AudioStream *os, void *audioData, int32_t numFrames) override {
        float *o = static_cast<float *>(audioData);
        if (tuner) tuner->tune();
        /* 1. on vide tout ce que le micro a déjà donné, sans attendre */
        int gotTotal = 0; float s2 = 0, p = 0;
        if (in) {
            for (int guard = 0; guard < 8; guard++) {
                auto rr = in->read(inBuf.data(), (int) inBuf.size(), 0);
                if (!rr || rr.value() <= 0) break;
                int got = rr.value(); gotTotal += got;
                if (recording) {
                    int n = recN.load(), k = std::min(got, (int) rec.size() - n);
                    for (int i = 0; i < k; i++) { float x = std::max(-1.f, std::min(1.f, inBuf[i])); rec[n + i] = (int16_t) lrintf(x * 32767.f); }
                    recN.store(n + k);
                }
                for (int i = 0; i < got; i++) { float x = inBuf[i]; s2 += x * x; p = std::max(p, std::fabs(x)); fifo[(fw + i) & (FIFO - 1)] = x; }
                fw += got;
                if (got < (int) inBuf.size()) break;
            }
        }
        if (gotTotal > 0) { lvl = std::sqrt(s2 / gotTotal); pk = p; }

        /* 2. réserve visée : juste ce que la sortie demande ; on n'ajoute de la marge que si le micro a déjà été en retard */
        const int64_t target = numFrames + extra;
        int64_t fill = fw - fr;
        if (fill > FIFO / 2) { fr = fw - target; fill = target; }               // trou énorme (appli en pause) : on se recale
        if (!primed) { if (fill >= target) primed = true; else { fill = 0; } }
        /* trop d'avance accumulée : on rattrape doucement en sautant 1 échantillon sur 64 (inaudible) */
        int skipEvery = (primed && fill > target + inBurst) ? 48 : 0;   // rattrape vite toute avance en trop
        if (primed && ++calm > 10000 && extra > 0) { extra -= 8; calm = 0; }  // ~30 s sans souci : on resserre

        const float goal = monitor ? vol.load() : 0.f;
        for (int f = 0; f < numFrames; f++) {
            float x;
            if (primed && fw - fr > 0) {
                if (skipEvery && (f % skipEvery) == 0 && fw - fr > 1) fr++;
                x = fifo[fr & (FIFO - 1)]; fr++; fadeOut = 1.f; lastOut = x;
            } else {
                /* le micro est en retard : on s'éteint en douceur au lieu de claquer, et on se remet en réserve */
                if (primed) { extra = std::min(extra + 16, 2 * inBurst); calm = 0; }
                primed = false; fadeOut *= 0.985f; x = lastOut * fadeOut;
            }
            gainNow += (goal - gainNow) * 0.002f;
            float v = x * gainNow;
            for (int c = 0; c < outCh; c++) o[f * outCh + c] = v;
        }
        return oboe::DataCallbackResult::Continue;
    }

    void onErrorAfterClose(oboe::AudioStream *, oboe::Result err) override {
        LOG("flux fermé (%s), réouverture", oboe::convertToText(err));
        bool again = wanted.load(), mon = monitor.load(), recg = recording.load();
        std::thread([this, again, mon, recg] {
            { std::lock_guard<std::mutex> g(lock);
              if (out) { out->close(); out.reset(); } if (in) { in->stop(); in->close(); in.reset(); }
              isOpen = false; tuner.reset(); }
            if (again && open()) { monitor = mon; recording = recg; }
        }).detach();
    }

    double latency() {
        double l = 0;
        if (out) { auto r = out->calculateLatencyMillis(); if (r) l += r.value(); }
        if (in) { auto r = in->calculateLatencyMillis(); if (r) l += r.value(); }
        return l;
    }
};

static Engine engine;

#define JFN(name) Java_fr_indiemusician_labo_NativeAudio_##name
extern "C" {
JNIEXPORT jboolean JNICALL JFN(open)(JNIEnv *, jobject) { return engine.open(); }
JNIEXPORT void JNICALL JFN(close)(JNIEnv *, jobject) { engine.close(); }
JNIEXPORT jboolean JNICALL JFN(isOpen)(JNIEnv *, jobject) { return engine.isOpen.load(); }
JNIEXPORT void JNICALL JFN(setMonitor)(JNIEnv *, jobject, jboolean on, jfloat v) { engine.vol = v; engine.monitor = on; }
JNIEXPORT void JNICALL JFN(recStart)(JNIEnv *, jobject) { engine.recN = 0; engine.recording = true; }
JNIEXPORT jint JNICALL JFN(recStop)(JNIEnv *, jobject) { engine.recording = false; return engine.recN.load(); }
JNIEXPORT jint JNICALL JFN(sampleRate)(JNIEnv *, jobject) { return engine.sr; }
JNIEXPORT jfloat JNICALL JFN(level)(JNIEnv *, jobject) { return engine.lvl.load(); }
JNIEXPORT jfloat JNICALL JFN(peak)(JNIEnv *, jobject) { return engine.pk.load(); }
JNIEXPORT jdouble JNICALL JFN(latencyMs)(JNIEnv *, jobject) { return engine.latency(); }
JNIEXPORT jint JNICALL JFN(recordedFrames)(JNIEnv *, jobject) { return engine.recN.load(); }
JNIEXPORT jbyteArray JNICALL JFN(readPcm16)(JNIEnv *env, jobject, jint from, jint count) {
    int n = engine.recN.load();
    int a = std::max(0, (int) from), b = std::min(n, (int) (from + count));
    int len = std::max(0, b - a);
    jbyteArray arr = env->NewByteArray(len * 2);
    if (len > 0) env->SetByteArrayRegion(arr, 0, len * 2, reinterpret_cast<const jbyte *>(engine.rec.data() + a));
    return arr;
}
}
