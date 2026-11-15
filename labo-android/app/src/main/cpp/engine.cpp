// Labo — moteur natif : micro + retour écouteurs en basse latence (Oboe / AAudio)
#include <jni.h>
#include <oboe/Oboe.h>
#include <android/log.h>
#include <atomic>
#include <vector>
#include <cmath>
#include <mutex>
#include <algorithm>

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

    bool open() {
        std::lock_guard<std::mutex> g(lock);
        if (isOpen) return true;
        if (rec.empty()) rec.assign(48000 * 60 * 5, 0);  // 5 minutes de prise
        oboe::AudioStreamBuilder ob;
        ob.setDirection(oboe::Direction::Output)
            ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
            ->setSharingMode(oboe::SharingMode::Exclusive)
            ->setFormat(oboe::AudioFormat::Float)
            ->setChannelCount(2)
            ->setUsage(oboe::Usage::Game)
            ->setDataCallback(this)
            ->setErrorCallback(this);
        if (ob.openStream(out) != oboe::Result::OK) { LOG("sortie impossible"); return false; }
        sr = out->getSampleRate(); outCh = out->getChannelCount();
        out->setBufferSizeInFrames(out->getFramesPerBurst() * 2);

        oboe::AudioStreamBuilder ib;
        ib.setDirection(oboe::Direction::Input)
            ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
            ->setSharingMode(oboe::SharingMode::Exclusive)
            ->setFormat(oboe::AudioFormat::Float)
            ->setChannelCount(1)
            ->setSampleRate(sr)
            ->setSampleRateConversionQuality(oboe::SampleRateConversionQuality::Medium)
            ->setFormatConversionAllowed(true)
            ->setChannelConversionAllowed(true)
            ->setInputPreset(oboe::InputPreset::VoicePerformance);
        oboe::Result r = ib.openStream(in);
        if (r != oboe::Result::OK) { ib.setInputPreset(oboe::InputPreset::Unprocessed); r = ib.openStream(in); }
        if (r != oboe::Result::OK) { ib.setInputPreset(oboe::InputPreset::Generic); r = ib.openStream(in); }
        if (r != oboe::Result::OK) { LOG("micro impossible"); out->close(); out.reset(); return false; }
        inBuf.assign(sr, 0.f);
        in->requestStart();
        out->requestStart();
        isOpen = true;
        LOG("ouvert : %d Hz, burst %d", sr, out->getFramesPerBurst());
        return true;
    }

    void close() {
        std::lock_guard<std::mutex> g(lock);
        recording = false; monitor = false;
        if (out) { out->stop(); out->close(); out.reset(); }
        if (in) { in->stop(); in->close(); in.reset(); }
        isOpen = false;
    }

    oboe::DataCallbackResult onAudioReady(oboe::AudioStream *os, void *audioData, int32_t numFrames) override {
        float *o = static_cast<float *>(audioData);
        int got = 0;
        if (in) {
            int avail = 0; auto a = in->getAvailableFrames(); if (a) avail = a.value();
            int want = std::min((int) inBuf.size(), std::max(numFrames, avail));
            auto rr = in->read(inBuf.data(), want, 0);
            if (rr) got = rr.value();
        }
        if (recording && got > 0) {
            int n = recN.load(), k = std::min(got, (int) rec.size() - n);
            for (int i = 0; i < k; i++) { float x = std::max(-1.f, std::min(1.f, inBuf[i])); rec[n + i] = (int16_t) (x * 32767.f); }
            recN.store(n + k);
        }
        if (got > 0) {
            float s = 0, p = 0;
            for (int i = 0; i < got; i++) { float x = inBuf[i]; s += x * x; p = std::max(p, std::fabs(x)); }
            lvl = std::sqrt(s / got); pk = p;
        }
        const float target = monitor ? vol.load() : 0.f;
        for (int f = 0; f < numFrames; f++) {
            int idx = got - numFrames + f;
            float x = (idx >= 0 && idx < got) ? inBuf[idx] : 0.f;
            gainNow += (target - gainNow) * 0.003f;
            float v = x * gainNow;
            for (int c = 0; c < outCh; c++) o[f * outCh + c] = v;
        }
        return oboe::DataCallbackResult::Continue;
    }

    void onErrorAfterClose(oboe::AudioStream *, oboe::Result err) override {
        LOG("flux fermé (%s), on rouvrira à la prochaine prise", oboe::convertToText(err));
        isOpen = false; out.reset(); in.reset();
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
