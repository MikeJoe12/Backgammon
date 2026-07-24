/**
 * Audio synthesis module for Backgammon game using the Web Audio API.
 * This avoids any external asset loading and guarantees instant sound effects.
 */
class BackgammonAudio {
    constructor() {
        this.ctx = null;
        this.enabled = true;
    }

    init() {
        if (this.ctx) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContextClass();
        } catch (e) {
            console.warn("Web Audio API not supported in this browser.", e);
            this.enabled = false;
        }
    }

    toggle(state) {
        this.enabled = state !== undefined ? state : !this.enabled;
        return this.enabled;
    }

    resumeContext() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * Plays the dice rolling sound, loading DiceRoll.mp3,
     * and falls back to synthesized noise sweep if unavailable.
     */
    playRoll() {
        if (!this.enabled) return;

        try {
            const audio = new Audio('DiceRoll.mp3');
            audio.volume = 0.55;
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(err => {
                    console.warn("DiceRoll.mp3 failed to play, falling back to synth roll.", err);
                    this.playSynthRoll();
                });
            }
        } catch (e) {
            console.warn("Audio object error, falling back to synth roll.", e);
            this.playSynthRoll();
        }
    }

    /**
     * Fallback synthesizer for tumbling/rolling dice sound.
     */
    playSynthRoll() {
        this.init();
        this.resumeContext();
        if (!this.ctx) return;

        const duration = 0.6;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 3.0;

        const now = this.ctx.currentTime;
        filter.frequency.setValueAtTime(400, now);
        filter.frequency.exponentialRampToValueAtTime(100, now + duration);

        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);

        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        noise.start(now);
        noise.stop(now + duration);
    }

    /**
     * Synthesizes a sharp wood/plastic clack for checker moves.
     */
    playMove() {
        if (!this.enabled) return;
        this.init();
        this.resumeContext();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;

        // Wooden clack is made of a low-frequency thump and a high-frequency click
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.08);

        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.08);

        // Add a tiny bit of high-frequency noise for the impact
        const clickDuration = 0.015;
        const clickBufSize = this.ctx.sampleRate * clickDuration;
        const clickBuffer = this.ctx.createBuffer(1, clickBufSize, this.ctx.sampleRate);
        const clickData = clickBuffer.getChannelData(0);
        for (let i = 0; i < clickBufSize; i++) {
            clickData[i] = Math.random() * 2 - 1;
        }

        const clickSource = this.ctx.createBufferSource();
        clickSource.buffer = clickBuffer;

        const clickGain = this.ctx.createGain();
        clickGain.gain.setValueAtTime(0.12, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + clickDuration);

        const clickFilter = this.ctx.createBiquadFilter();
        clickFilter.type = 'highpass';
        clickFilter.frequency.setValueAtTime(2000, now);

        clickSource.connect(clickFilter);
        clickFilter.connect(clickGain);
        clickGain.connect(this.ctx.destination);

        clickSource.start(now);
        clickSource.stop(now + clickDuration);
    }

    /**
     * Synthesizes a metallic clink when a checker is hit onto the bar.
     */
    playHit() {
        if (!this.enabled) return;
        this.init();
        this.resumeContext();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const duration = 0.25;

        // Two oscillators for a metallic ring
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(880, now); // A5

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1320, now); // E6 (fifth)

        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + duration);
        osc2.stop(now + duration);
    }

    /**
     * Synthesizes a swoosh/slide sound for bearing off.
     */
    playBearOff() {
        if (!this.enabled) return;
        this.init();
        this.resumeContext();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const duration = 0.2;

        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(450, now + duration);

        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.linearRampToValueAtTime(0.2, now + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + duration);
    }

    /**
     * Synthesizes a celebratory victory tune.
     */
    playVictory() {
        if (!this.enabled) return;
        this.init();
        this.resumeContext();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const notes = [
            { f: 261.63, d: 0.15 }, // C4
            { f: 329.63, d: 0.15 }, // E4
            { f: 392.00, d: 0.15 }, // G4
            { f: 523.25, d: 0.40 }  // C5
        ];

        let timeOffset = 0;
        notes.forEach((note) => {
            const osc = this.ctx.createOscillator();
            const gainNode = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(note.f, now + timeOffset);

            gainNode.gain.setValueAtTime(0, now + timeOffset);
            gainNode.gain.linearRampToValueAtTime(0.25, now + timeOffset + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + timeOffset + note.d);

            osc.connect(gainNode);
            gainNode.connect(this.ctx.destination);

            osc.start(now + timeOffset);
            osc.stop(now + timeOffset + note.d);

            timeOffset += note.d * 0.8;
        });
    }
}

// Export as a global class or singleton
window.gameAudio = new BackgammonAudio();
