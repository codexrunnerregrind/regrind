package org.regrind

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper

// Main-thread only. Mirrors FlipPrivacy.m: a fresh face-down held for HOLD_MS
// fires once; only returning upright rearms it. Listens only while enabled and resumed.
class FlipPrivacy(context: Context, private val onFlip: () -> Unit) : SensorEventListener {
	private val sensors = context.getSystemService(SensorManager::class.java)
	private val sensor = sensors?.getDefaultSensor(Sensor.TYPE_GRAVITY)
		?: sensors?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
	private val handler = Handler(Looper.getMainLooper())
	private var enabled = false
	private var resumed = false
	private var listening = false
	private var armed: Boolean? = null
	private var faceDown = false
	private val fire = Runnable { if (listening && faceDown) onFlip() }

	val available get() = sensor != null

	fun setEnabled(value: Boolean) {
		enabled = value
		update()
	}

	fun setResumed(value: Boolean) {
		resumed = value
		update()
	}

	private fun update() {
		val want = enabled && resumed && sensor != null
		if (want == listening) return
		listening = want
		armed = null
		faceDown = false
		handler.removeCallbacks(fire)
		if (want) sensors?.registerListener(this, sensor, SAMPLING_US, handler)
		else sensors?.unregisterListener(this)
	}

	override fun onSensorChanged(event: SensorEvent) {
		val z = event.values[2]
		val down = z <= FACE_DOWN_Z
		if (armed == null) {
			armed = !down
			faceDown = down
			return
		}
		if (!down) {
			if (faceDown) {
				faceDown = false
				handler.removeCallbacks(fire)
			}
			if (z >= REARM_Z) armed = true
			return
		}
		if (faceDown) return
		faceDown = true
		if (armed != true) return
		armed = false
		handler.postDelayed(fire, HOLD_MS)
	}

	override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

	private companion object {
		const val SAMPLING_US = 200_000
		const val FACE_DOWN_Z = -8f
		const val REARM_Z = -4f
		const val HOLD_MS = 300L
	}
}
