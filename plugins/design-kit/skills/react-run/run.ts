/**
 * Run a block inline and return its value. Use it for logic inside JSX (one `if` + early return per
 * condition instead of nested ternaries) and instead of IIFEs. Inside a normal function body, just
 * write the ifs. Pattern: https://www.edoardolunardi.dev/blog/writing-cleaner-react-with-a-tiny-utility
 */
export const run = <T,>(fn: () => T): T => fn();
