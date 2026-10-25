import React, { useState, useEffect } from 'react';

export function UserProfileConcise({ count }: { count: number }) {
  const [doubled, setDoubled] = useState(0);

  // Edge case: Concise arrow function body
  useEffect(() => setDoubled(count * 2), [count]);

  return <div>{doubled}</div>;
}
