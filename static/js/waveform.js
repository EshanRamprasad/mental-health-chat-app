// Audio waveform visualization with fluid animations
class WaveformVisualizer {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.isPlaying = false;
        this.particles = [];
        this.numParticles = options.particles || 100;
        this.color = options.color || '#4A90E2'; // Calming blue
        this.time = 0;
        this.initCanvas();
        this.createParticles();
        this.animate = this.animate.bind(this);
    }

    initCanvas() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = this.canvas.offsetWidth * window.devicePixelRatio;
        this.canvas.height = this.canvas.offsetHeight * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.createParticles(); // Recreate particles on resize
    }

    createParticles() {
        this.particles = [];
        for (let i = 0; i < this.numParticles; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: this.canvas.height / 2,
                amplitude: Math.random() * 50 + 20,
                speed: 0.02 + Math.random() * 0.02,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    start() {
        this.isPlaying = true;
        this.animate();
    }

    stop() {
        this.isPlaying = false;
    }

    drawParticle(particle, index) {
        const gradient = this.ctx.createLinearGradient(
            particle.x, 
            particle.y - particle.amplitude, 
            particle.x, 
            particle.y + particle.amplitude
        );

        // Use calming colors
        gradient.addColorStop(0, 'rgba(74, 144, 226, 0.7)'); // Light blue
        gradient.addColorStop(0.5, 'rgba(94, 164, 246, 0.5)'); // Mid blue
        gradient.addColorStop(1, 'rgba(74, 144, 226, 0.7)'); // Light blue

        this.ctx.beginPath();
        this.ctx.moveTo(particle.x, particle.y);

        // Calculate wave movement
        const time = this.time * particle.speed;
        const yOffset = Math.sin(time + particle.phase) * particle.amplitude;

        // Create smooth curve
        this.ctx.bezierCurveTo(
            particle.x, particle.y + yOffset,
            particle.x, particle.y + yOffset,
            particle.x, particle.y
        );

        this.ctx.strokeStyle = gradient;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Add glow effect
        this.ctx.shadowColor = 'rgba(74, 144, 226, 0.3)';
        this.ctx.shadowBlur = 15;
    }

    animate() {
        if (!this.isPlaying) return;

        // Clear canvas with fade effect
        this.ctx.fillStyle = 'rgba(33, 37, 41, 0.1)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Update and draw particles
        this.particles.forEach((particle, index) => {
            this.drawParticle(particle, index);
        });

        this.time += 0.016; // Approximately 60fps
        requestAnimationFrame(this.animate);
    }
}

// Export for use in other files
window.WaveformVisualizer = WaveformVisualizer;