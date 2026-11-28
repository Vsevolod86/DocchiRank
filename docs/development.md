# Разработка DocchiRank

См. [локальный запуск](../README.md#запуск). Карта компонентов доступна по пути `/components.html` через `pnpm dev`. В ней есть примеры UI-кита и демонстрация приложения с отдельным хранилищем в памяти.

## Настройки

Начальные значения, интервалы и ограничения описаны в комментариях к [файлам настроек](../src/config/).

## Проверка

- **Тесты.** `pnpm test` запускает тесты, `pnpm test:watch` повторяет их при изменениях.
- **Сборка.** `pnpm build` проверяет TypeScript и создаёт `dist/`. `pnpm preview` показывает результат локально.
- **Замеры.** `pnpm benchmark:sorting` воспроизводит измерения движка. [Результаты замеров](../tools/sorting-benchmark/results.md)

## Публикация

Сценарий **Check** запускает тесты и сборку в pull request. Для выпуска запусти **Publish to GitHub Pages** вручную из ветки `main`. Он повторит проверки и опубликует `dist/`. При первой публикации выбери **GitHub Actions** в **Settings → Pages → Source**. [Настройка GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site#publishing-with-a-custom-github-actions-workflow)

## Устройство проекта

- **Интерфейс.** `src/main.ts` подключает адаптеры. Зависимости идут от `app` через `pages` и `widgets` к `features`, `entities` и `shared`. `shared/ui` задаёт базовые компоненты и токены, события обрабатывает приложение.
- **Данные.** `integrations` загружает внешние данные, `storage` хранит коллекции и проверяет резервные копии. [Форматы JSON](json-formats.md)
