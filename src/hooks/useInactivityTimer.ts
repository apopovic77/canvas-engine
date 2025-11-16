import { useEffect, useRef, useState } from 'react';

/**
 * Configuration options for inactivity timer
 */
interface UseInactivityTimerOptions {
  /**
   * Timeout duration in milliseconds before considering user inactive
   * @default 60000 (60 seconds)
   */
  timeout?: number;

  /**
   * Callback triggered when inactivity timeout is reached
   */
  onTimeout?: () => void;

  /**
   * Callback triggered when activity starts (first interaction after inactive period)
   */
  onActivityStart?: () => void;

  /**
   * Whether to start the timer automatically on mount
   * @default false
   */
  autoStart?: boolean;
}

/**
 * Return type of useInactivityTimer hook
 */
interface UseInactivityTimerReturn {
  /**
   * Whether the user is currently in active mode
   */
  isActive: boolean;

  /**
   * Reset the inactivity timer (call this on user interactions)
   */
  resetTimer: () => void;

  /**
   * Manually start the timer
   */
  startTimer: () => void;

  /**
   * Manually stop the timer
   */
  stopTimer: () => void;

  /**
   * Set active state manually
   */
  setActive: (active: boolean) => void;
}

const DEFAULT_TIMEOUT = 60000; // 60 seconds

/**
 * React hook for managing user inactivity detection
 *
 * Useful for kiosk mode applications where you want to return to a default state
 * after a period of user inactivity.
 *
 * @example
 * ```tsx
 * const { isActive, resetTimer } = useInactivityTimer({
 *   timeout: 60000,
 *   onTimeout: () => {
 *     console.log('User inactive - returning to overview');
 *     setKioskMode('overview');
 *   },
 *   onActivityStart: () => {
 *     console.log('User became active');
 *     setKioskMode('manual');
 *   }
 * });
 *
 * // Call resetTimer on user interactions:
 * <canvas
 *   onClick={resetTimer}
 *   onWheel={resetTimer}
 *   onTouchStart={resetTimer}
 * />
 * ```
 */
export function useInactivityTimer({
  timeout = DEFAULT_TIMEOUT,
  onTimeout,
  onActivityStart,
  autoStart = false,
}: UseInactivityTimerOptions = {}): UseInactivityTimerReturn {
  const [isActive, setIsActive] = useState(autoStart);
  const timerRef = useRef<number | null>(null);

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = () => {
    stopTimer();
    timerRef.current = window.setTimeout(() => {
      console.log('[InactivityTimer] Timeout reached - user inactive');
      setIsActive(false);
      if (onTimeout) {
        onTimeout();
      }
    }, timeout);
  };

  const resetTimer = () => {
    const wasInactive = !isActive;

    // Set active state
    if (wasInactive) {
      setIsActive(true);
      if (onActivityStart) {
        onActivityStart();
      }
    }

    // Restart timer
    startTimer();
  };

  // Cleanup timer on unmount
  useEffect(() => {
    if (autoStart) {
      startTimer();
    }

    return () => {
      stopTimer();
    };
  }, []);

  return {
    isActive,
    resetTimer,
    startTimer,
    stopTimer,
    setActive: setIsActive,
  };
}
