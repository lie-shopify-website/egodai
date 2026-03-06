/**
 * @description MFVideo 组件
 * @author luochongfei
 * @使用
 * <mf-video>
 *   <source src="https://example.com/video.mp4" />
 *   <source src="https://example.com/video.mp4" media="(min-width: 768px)" />
 * </mf-video>
 * 
 * @支持的属性
 * <mf-video controls pause-on-invisible lazy muted autoplay loop playsinline>
 *   <source src="https://example.com/video.mp4" />
 * </mf-video>
 * 
 * @支持定制样式
 * <mf-video style="--mf-video-bg: #e5e7eb; --mf-video-object-fit: contain; --mf-video-loading-circle-width: 40px; --mf-video-loading-line-width: 4px; --mf-video-loading-color: #f00;">
 *   <source src="https://example.com/video.mp4" />
 * </mf-video>
 */
class MFVideo extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.isLoaded = false;
        this.sources = [];
        this.hasSrc = false;
    }

    connectedCallback() {
        this.parseSources();
        this.render();
        this.setup();
        
        // 监听 source 标签的 src 属性变化（用于懒加载库动态设置 src）
        this.setupSourceObserver();
    }

    parseSources() {
        this.sources = [];
        const sources = this.querySelectorAll('source');
        
        sources.forEach(s => {
            const src = s.getAttribute('src');
            if (src) {
                this.sources.push({
                    media: s.getAttribute('media'),
                    src: src,
                    poster: s.getAttribute('poster'),
                    ratio: s.getAttribute('aspect-ratio') || s.getAttribute('ratio')
                });
            }
        });

        // 检查是否有有效的 src
        this.hasSrc = this.sources.length > 0;

        // 排序：min-width 优先
        this.sources.sort((a, b) => {
            if (!a.media) return 1;
            if (!b.media) return -1;
            const aMin = a.media.includes('min-width');
            const bMin = b.media.includes('min-width');
            if (aMin && !bMin) return -1;
            if (!aMin && bMin) return 1;
            if (aMin && bMin) {
                return parseInt(b.media.match(/\d+/)[0]) - parseInt(a.media.match(/\d+/)[0]);
            }
            return parseInt(a.media.match(/\d+/)?.[0] || 0) - parseInt(b.media.match(/\d+/)?.[0] || 0);
        });
    }

    calcRatio(ratio) {
        if (!ratio) return '';
        if (ratio.includes('%')) return ratio;
        if (ratio.includes(':')) {
            const [w, h] = ratio.split(':').map(Number);
            return (h / w * 100) + '%';
        }
        return (1 / parseFloat(ratio) * 100) + '%';
    }

    setupSourceObserver() {
        // 使用 MutationObserver 监听 source 标签的 src 属性变化
        this.observer = new MutationObserver(() => {
            const hadSrc = this.hasSrc;
            this.parseSources();
            
            // 从无 src 到有 src，触发懒加载
            if (!hadSrc && this.hasSrc && !this.isLoaded) {
                if (this.loadFunction) {
                    this.loadFunction();
                    this.isLoaded = true;
                }
            }
        });

        this.observer.observe(this, {
            attributes: true,
            attributeFilter: ['src'],
            subtree: true,
            childList: true
        });
    }

    getActiveSource() {
        const w = window.innerWidth;
        for (const s of this.sources) {
            if (!s.media) return s;
            const min = s.media.match(/min-width:\s*(\d+)/);
            const max = s.media.match(/max-width:\s*(\d+)/);
            if (min && w >= parseInt(min[1])) return s;
            if (max && w <= parseInt(max[1])) return s;
        }
        return this.sources[0];
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host { display: block; width: 100%; position: relative; }
                .c { position: relative; width: 100%; height: 100%; background: var(--mf-video-bg, #e5e7eb); overflow: hidden; }
                .c.r { height: 0; }
                video { display: block; width: 100%; height: 100%; object-fit: var(--mf-video-object-fit, cover); }
                .c.r video { position: absolute; top: 0; left: 0; }
                .l { position: absolute; inset: 0; z-index: 10; background: var(--mf-video-loading-bg, rgba(0,0,0,.16)); display: flex; align-items: center; justify-content: center; }
                .l::after { content: ""; width: var(--mf-video-loading-circle-width, 40px); height: var(--mf-video-loading-circle-width, 40px); border: var(--mf-video-loading-line-width, 4px) solid #eee; border-top-color: var(--mf-video-loading-color, #fed100); border-radius: 50%; animation: s .5s linear infinite; }
                @keyframes s { to { transform: rotate(360deg); } }
                .l.h { display: none; }
            </style>
            <div class="c"><div class="l h"></div><video></video></div>
        `;
    }

    setup() {
        const video = this.shadowRoot.querySelector('video');
        const loading = this.shadowRoot.querySelector('.l');
        const container = this.shadowRoot.querySelector('.c');

        // 设置 video 属性
        const setAttrs = () => {
            if (this.hasAttribute('controls')) video.controls = true;
            if (this.hasAttribute('muted')) video.muted = true;
            if (this.hasAttribute('loop')) video.loop = true;
            if (this.hasAttribute('autoplay')) video.autoplay = true;
            if (this.hasAttribute('playsinline')) video.playsInline = true;
            video.preload = this.getAttribute('preload') || 'metadata';
        };

        const load = () => {
            const src = this.getActiveSource();
            if (!src?.src) {
                console.warn('MFVideo: No valid source');
                return;
            }

            // 避免重复加载相同视频
            const newSrc = src.src;
            if (video.src?.split('/').pop() === newSrc?.split('/').pop()) return;

            // 处理 aspect-ratio
            const ratio = this.calcRatio(src.ratio);
            container.classList.toggle('r', !!ratio);
            if (ratio) {
                container.style.paddingTop = ratio;
            } else {
                container.style.paddingTop = '';
            }

            loading.classList.remove('h');
            video.src = src.src;
            if (src.poster) video.poster = src.poster;
            
            setAttrs();
            video.load();

            // autoplay 处理
            if (this.hasAttribute('autoplay')) {
                video.play().catch(() => console.warn('MFVideo: Autoplay blocked'));
            }
        };

        // 保存 load 函数供 MutationObserver 使用
        this.loadFunction = load;

        // 加载事件
        video.onloadeddata = () => loading.classList.add('h');
        video.onerror = () => loading.classList.add('h');

        // 懒加载逻辑
        if (this.hasAttribute('lazy')) {
            // 如果初始有 src，使用 IntersectionObserver
            if (this.hasSrc) {
                const observer = new IntersectionObserver((entries) => {
                    if (entries[0].isIntersecting && !this.isLoaded) {
                        load();
                        this.isLoaded = true;
                        
                        if (this.hasAttribute('pause-on-invisible')) {
                            this.setupVisibilityControl(video);
                        }
                    }
                }, { threshold: 0.01, rootMargin: '50px' });
                observer.observe(this);
            }
            // 如果初始无 src，等待 MutationObserver 检测到 src 变化
            else {
                // pause-on-invisible 会在加载后自动设置
                if (this.hasAttribute('pause-on-invisible')) {
                    const waitForLoad = setInterval(() => {
                        if (this.isLoaded) {
                            this.setupVisibilityControl(video);
                            clearInterval(waitForLoad);
                        }
                    }, 100);
                }
            }
        } else {
            // 非懒加载模式，立即加载
            if (this.hasSrc) {
                load();
                this.isLoaded = true;
                
                if (this.hasAttribute('pause-on-invisible')) {
                    this.setupVisibilityControl(video);
                }
            } else {
                console.warn('MFVideo: No source provided');
            }
        }

        // 响应式切换
        let timer;
        window.addEventListener('resize', () => {
            clearTimeout(timer);
            timer = setTimeout(() => this.isLoaded && load(), 100);
        });
    }

    disconnectedCallback() {
        // 清理 MutationObserver
        if (this.observer) {
            this.observer.disconnect();
        }
    }

    setupVisibilityControl(video) {
        const observer = new IntersectionObserver((entries) => {
            const isVisible = entries[0].isIntersecting;
            if (isVisible && video.paused && this.hasAttribute('autoplay')) {
                video.play().catch(() => {});
            } else if (!isVisible && !video.paused) {
                video.pause();
            }
        }, { threshold: 0.1, rootMargin: '0px 0px -10% 0px' });
        
        observer.observe(this);
    }
}

customElements.define('mf-video', MFVideo);
