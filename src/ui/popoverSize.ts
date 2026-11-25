/** Width of one option button plus the gap; the popover adds its padding. */
export const OPTION_PITCH = 84;
export const POPOVER_PAD = 24;
export const popoverWidth = (options: number) => options * OPTION_PITCH + POPOVER_PAD;
/** Height of a popover with one row of options, used until the real height is measured. */
export const POPOVER_HEIGHT = 148;
