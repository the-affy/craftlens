import React from 'react';

export function AccessibleButtons() {
  return (
    <div>
      <button type="button" onClick={() => console.log('native button')}>
        Accessible
      </button>

      <div
        role="button"
        tabIndex={0}
        onClick={() => console.log('custom button')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            console.log('keyboard trigger');
          }
        }}
      >
        Custom Accessible Button
      </div>
    </div>
  );
}
