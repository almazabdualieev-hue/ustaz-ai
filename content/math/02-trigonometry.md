# Лекция 2. Тригонометрия: основные тождества

## 1. Единичная окружность и определения
**Единичная окружность** — окружность радиуса 1 с центром в начале координат. Угол $\alpha$ отсчитывается от положительного направления оси $Ox$ против часовой стрелки.
Для точки окружности, соответствующей углу $\alpha$:
- $\cos \alpha$ — её абсцисса ($x$),
- $\sin \alpha$ — её ордината ($y$),
- $\operatorname{tg} \alpha = \frac{\sin \alpha}{\cos \alpha}$ (при $\cos \alpha \neq 0$),
- $\operatorname{ctg} \alpha = \frac{\cos \alpha}{\sin \alpha}$ (при $\sin \alpha \neq 0$).

Радианная мера: $180^\circ = \pi$ рад.

## 2. Значения для основных углов
| $\alpha$ | $0^\circ$ | $30^\circ = \frac{\pi}{6}$ | $45^\circ = \frac{\pi}{4}$ | $60^\circ = \frac{\pi}{3}$ | $90^\circ = \frac{\pi}{2}$ |
|---|---|---|---|---|---|
| $\sin \alpha$ | $0$ | $\frac{1}{2}$ | $\frac{\sqrt{2}}{2}$ | $\frac{\sqrt{3}}{2}$ | $1$ |
| $\cos \alpha$ | $1$ | $\frac{\sqrt{3}}{2}$ | $\frac{\sqrt{2}}{2}$ | $\frac{1}{2}$ | $0$ |
| $\operatorname{tg} \alpha$ | $0$ | $\frac{\sqrt{3}}{3}$ | $1$ | $\sqrt{3}$ | не существует |

## 3. Основные тригонометрические тождества
- **Основное тождество:** $\sin^2 \alpha + \cos^2 \alpha = 1$
- $\operatorname{tg} \alpha \cdot \operatorname{ctg} \alpha = 1$
- $1 + \operatorname{tg}^2 \alpha = \frac{1}{\cos^2 \alpha}$
- $1 + \operatorname{ctg}^2 \alpha = \frac{1}{\sin^2 \alpha}$

## 4. Пример: нахождение функций по одной известной
Дано: $\sin \alpha = \frac{3}{5}$, угол $\alpha$ в I четверти. Найти $\cos \alpha$ и $\operatorname{tg} \alpha$.
- Из основного тождества: $\cos^2 \alpha = 1 - \frac{9}{25} = \frac{16}{25}$.
- В I четверти косинус положителен, значит $\cos \alpha = \frac{4}{5}$.
- $\operatorname{tg} \alpha = \frac{3/5}{4/5} = \frac{3}{4}$.

Важно: знак корня выбирается по четверти (см. раздел 5).

## 5. Знаки по четвертям
| Четверть | $\sin$ | $\cos$ | $\operatorname{tg}$ |
|---|---|---|---|
| I ($0$ до $\frac{\pi}{2}$) | + | + | + |
| II ($\frac{\pi}{2}$ до $\pi$) | + | − | − |
| III ($\pi$ до $\frac{3\pi}{2}$) | − | − | + |
| IV ($\frac{3\pi}{2}$ до $2\pi$) | − | + | − |

## 6. Формулы двойного угла
- $\sin 2\alpha = 2 \sin \alpha \cos \alpha$
- $\cos 2\alpha = \cos^2 \alpha - \sin^2 \alpha = 1 - 2\sin^2 \alpha = 2\cos^2 \alpha - 1$

Пример: для угла из раздела 4: $\sin 2\alpha = 2 \cdot \frac{3}{5} \cdot \frac{4}{5} = \frac{24}{25}$.
