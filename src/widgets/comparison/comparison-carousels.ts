import { INTERFACE_TIMING } from '../../config/interface';

/** Запускает смену карточек и возвращает остановку таймера при смене экрана. */
export function startComparisonCarousels(container: HTMLElement): (() => void) | null {
    const carousels = Array.from(container.querySelectorAll('[data-comparison-carousel]'), carousel => {
        const slides = carousel.querySelectorAll<HTMLElement>('[data-carousel-slide]');
        const position = carousel.querySelector<HTMLElement>('.comparison-carousel-position')!;
        const pause = carousel.querySelector<HTMLButtonElement>('.comparison-carousel-pause')!;
        let index = 0;

        pause.addEventListener('click', () => {
            pause.setAttribute('aria-pressed', String(pause.getAttribute('aria-pressed') !== 'true'));
        });

        return () => {
            const active = slides[index]!;
            if (pause.getAttribute('aria-pressed') === 'true' || active.contains(container.ownerDocument.activeElement)) return;
            active.hidden = true;
            index = (index + 1) % slides.length;
            slides[index]!.hidden = false;
            position.textContent = `${index + 1} / ${slides.length}`;
        };
    });
    if (!carousels.length) return null;

    const timer = setInterval(() => {
        if (!container.isConnected) {
            clearInterval(timer);
            return;
        }
        if (!container.ownerDocument.hidden) carousels.forEach(advance => advance());
    }, INTERFACE_TIMING.groupCarouselMs);
    return () => clearInterval(timer);
}
