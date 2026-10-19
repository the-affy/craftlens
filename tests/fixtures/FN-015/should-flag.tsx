import React from 'react';

export function FlawedCard() {
  return (
    <div onClick={() => console.log('card clicked')}>
      <span>Title</span>
    </div>
  );
}

export function FlawedSpan() {
  return (
    <span onClick={() => alert('span clicked')}>
      Click me
    </span>
  );
}
