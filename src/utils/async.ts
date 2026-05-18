/**
 * Async Utilities
 *
 * sleep: Promise-based delay
 * debounce: Delay function execution until after a period of inactivity
 */
export const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const debounce = (func, timeout = 300) => {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func(...args);
    }, timeout);
  };
  // cancel: allow cancelling pending delayed calls on component unmount
  debounced.cancel = () => {
    clearTimeout(timer);
  };
  return debounced;
};
