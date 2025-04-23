import discord
from discord.ext import commands, tasks
import a2s
import os

class ServerMonitorBot(commands.Bot):
    def __init__(self):
        super().__init__(
            command_prefix="!",
            intents=discord.Intents.default(),
            help_command=None
        )
        self.server_address = (os.getenv('SERVER_IP'), int(os.getenv('SERVER_PORT')))
        self.update_interval = int(os.getenv('UPDATE_INTERVAL', 120))

    @tasks.loop(minutes=2)
    async def update_status(self):
        try:
            server_info = a2s.info(self.server_address)
            players = a2s.players(self.server_address)
            
            await self.change_presence(
                activity=discord.Activity(
                    type=discord.ActivityType.watching,
                    name=f"{len(players)}/{server_info.max_players} players"
                )
            )
        except Exception as e:
            print(f"Error: {e}")

    async def setup_hook(self):
        self.update_status.start()

    async def on_ready(self):
        print(f"Logged in as {self.user}")

bot = ServerMonitorBot()

if __name__ == "__main__":
    bot.run(os.getenv('DISCORD_TOKEN'))