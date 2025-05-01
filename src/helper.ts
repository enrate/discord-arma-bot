import path from 'path';
import { Player } from './types';
import axios from 'axios';
import fs from 'fs';

  
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

  export const isUUIDv4 = (uuid: string): boolean => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}


export async function getSteamAvatar(steamId64: string) {
  const API_KEY = '517E306AA0192E90FFEEAFF3FFCFE5FA';
  try {
    const response = await axios.get(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${API_KEY}&steamids=${steamId64}`
    );
    
    const avatarUrl = response.data.response.players[0].avatarfull;

    const responseImage = await axios({
      method: 'GET',
      url: avatarUrl,
      responseType: 'arraybuffer' // Важно для бинарных данных
  });

     return {
         url: avatarUrl,
         buffer: responseImage.data
     };
  } catch (error) {
    console.error('Ошибка:', error);
    return null;
  }
}

