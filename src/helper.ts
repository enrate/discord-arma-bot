import { Player } from './types';

  
  export const parsePlayersData = (message: string): Player[] => {
    return message
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith('Players on server');
      })
      .map(line => {
        const parts = line.split(';').map(part => part.trim());
        
        if (parts.length !== 3) return null;
        
        const number = parseInt(parts[0]), uid = parts[1], name = parts[2];
        
        if (isNaN(number) || !uid || !name) return null;
        
        return { number, uid, name };
      })
      .filter((player): player is Player => player !== null);
  };