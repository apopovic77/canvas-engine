import React from 'react';

/**
 * Wrapper component that shows a loading indicator
 *
 * This component displays children only when isLoading is false.
 * Used to show a loading state while the app initializes.
 */
export const AppPreloaderWrapper: React.FC<{
  children: React.ReactNode;
  isLoading?: boolean;
}> = ({ children, isLoading = false }) => {
  // Log loading state for debugging
  React.useEffect(() => {
    if (isLoading) {
      console.log('[Preloader] Loading...');
    } else {
      console.log('[Preloader] Complete! Initializing app...');
    }
  }, [isLoading]);

  // Don't render the app until loading is complete
  if (isLoading) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#ffffff',
      }}>
        <div style={{
          fontSize: '18px',
          color: '#666',
          fontFamily: 'system-ui, sans-serif',
        }}>
          Loading...
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
