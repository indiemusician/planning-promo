package fr.indiemusician.labo

/** Moteur audio natif (Oboe / AAudio) : micro + retour dans les écouteurs en basse latence. */
object NativeAudio {
    init { System.loadLibrary("labo_audio") }
    external fun open(): Boolean
    external fun close()
    external fun isOpen(): Boolean
    external fun setMonitor(on: Boolean, volume: Float)
    external fun recStart()
    external fun recStop(): Int
    external fun sampleRate(): Int
    external fun level(): Float
    external fun peak(): Float
    external fun latencyMs(): Double
    external fun recordedFrames(): Int
    /** renvoie les échantillons [from, from+count) en PCM 16 bits little-endian */
    external fun readPcm16(from: Int, count: Int): ByteArray
}
