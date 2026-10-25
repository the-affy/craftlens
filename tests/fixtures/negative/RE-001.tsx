import React, { useState, useEffect } from 'react';

export function UserProfile({ user }: { user: { firstName: string; lastName: string } }) {
  // Correct: Computed directly during render
  const fullName = `${user.firstName} ${user.lastName}`;

  // Valid effect: external network side-effect
  useEffect(() => {
    fetch(`/api/log?name=${encodeURIComponent(fullName)}`);
  }, [fullName]);

  return <div>{fullName}</div>;
}
