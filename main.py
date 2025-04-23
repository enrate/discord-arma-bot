# main.py
import discord
from discord.ext import tasks
import a2s
import os

class ServerMonitorBot(discord.Bot):
    def __init__(self):
        super().__init__(intents=discord.Intents.default())
        self.server_address = (os.getenv('SERVER_IP'), int(os.getenv('SERVER_PORT')))
        self.update_interval = int(os.getenv('UPDATE_INTERVAL', 120))

    @tasks.loop(minutes=2)
    async def update_status(self):
        try:
            # Получаем общую информацию о сервере
            server_info = a2s.info(self.server_address)
            # Получаем список текущих игроков
            players = a2s.players(self.server_address)
            
            await self.change_presence(
                activity=discord.Activity(
                    type=discord.ActivityType.watching,
                    name=f"{len(players)}/{server_info.max_players} players"
                )
            )
        except Exception as e:
            print(f"Error updating status: {e}")

    async def on_ready(self):
        print(f"Logged in as {self.user}")
        self.update_status.change_interval(seconds=self.update_interval)
        self.update_status.start()

bot = ServerMonitorBot()

if __name__ == "__main__":
    bot.run(os.getenv('DISCORD_TOKEN'))