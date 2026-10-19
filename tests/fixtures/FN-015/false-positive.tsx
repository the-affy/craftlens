import React from 'react';

// Custom design-system component
function CardButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick}>{children}</button>;
}

export function Consumer() {
  return (
    <CardButton onClick={() => console.log('clicked')}>
      Custom Button
    </CardButton>
  );
}
