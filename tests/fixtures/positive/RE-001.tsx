import React, { useState, useEffect } from 'react';

export function UserProfile({ user }: { user: { firstName: string; lastName: string } }) {
  const [fullName, setFullName] = useState('');

  // Positive case for RE-001: Redundant useEffect setting state from prop
  useEffect(() => {
    setFullName(user.firstName + ' ' + user.lastName);
  }, [user]);

  return <div>{fullName}</div>;
}
