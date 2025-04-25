import { ActivityType, Client } from 'discord.js';
import nodea2s from 'node-a2s';

export class StatusManager {
    static async update(client: Client, ip: string, port: number) {
        try {
            const originalConsoleLog = console.log;
            const originalConsoleError = console.error;
            
            console.log = () => {};
            console.error = () => {};
            
            const serverInfo = await nodea2s.info(`${ip}:${port}`);
            
            console.log = originalConsoleLog;
            console.error = originalConsoleError;

            await client.user?.setActivity({
                name: `${serverInfo.players}/${serverInfo.maxPlayers} | Server 1 (1pp)`,
                type: ActivityType.Playing
            });
        } catch (e) {
            console.error('Status update error:', e);
        }
    }
}