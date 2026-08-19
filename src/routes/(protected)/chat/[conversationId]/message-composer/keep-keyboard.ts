/**
 * Holds the field's focus — and with it the keyboard — through a tap on one of
 * the composer's own controls.
 *
 * Losing it is not merely cosmetic. `applyKeyboardInset` listens on focusout,
 * drops `--keyboard-inset` and hands `--safe-area-bottom` back, so the composer
 * slides down into the space the keys had — all before the tap has resolved into
 * a click. The control is out from under the finger by then and the press is
 * spent: the tap looks like it only dismissed the keyboard, and has to be made a
 * second time. Controls that do want the keyboard gone are better off letting it
 * go once they have opened, rather than through the tap that opened them.
 *
 * Wire it to *both* `pointerdown` and `mousedown`, because neither alone covers
 * both platforms. WebKit ignores preventDefault on a touch-derived pointerdown,
 * but it does still dispatch mousedown — after touchend, so cancelling that
 * holds the focus without disturbing the sequence the click comes from. Android
 * honours the pointerdown.
 */
export function keepKeyboard(event: Event) {
	event.preventDefault();
}
