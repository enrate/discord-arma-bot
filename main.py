import discord
from discord.ext import commands, tasks
import os
import json
from ftplib import FTP
from io import BytesIO

class ServerMonitorBot(commands.Bot):
    def __init__(self):
        super().__init__(
            command_prefix="!",
            intents=discord.Intents.all(),
            help_command=None
        )
        self.ftp_config = {
            "host": os.getenv('FTP_HOST'),
            "port": int(os.getenv('FTP_PORT')),
            "user": os.getenv('FTP_USER'),
            "password": os.getenv('FTP_PASSWORD'),
            "file_path": "/profiles/ArmaReforgerServer/profile/ServerAdminTools_Stats.json"
        }
        self.channel_id = int(os.getenv('CHANNEL_ID'))
        self.status_message = None

    async def setup_hook(self):
        self.update_status.start()
        self.update_player_list.start()
        
        channel = self.get_channel(self.channel_id)
        if channel:
            self.status_message = await channel.send("Инициализация...")

    def get_players_from_ftp(self):
        try:
            with FTP() as ftp:
                ftp.connect(self.ftp_config["host"], self.ftp_config["port"])
                ftp.login(self.ftp_config["user"], self.ftp_config["password"])
                
                # Скачиваем файл в память
                data = BytesIO()
                ftp.retrbinary(f"RETR {self.ftp_config['file_path']}", data.write)
                data.seek(0)
                
                stats = json.load(data)
                return list(stats["connected_players"].values())
                
        except Exception as e:
            print(f"Ошибка FTP: {str(e)}")
            return None

    @tasks.loop(minutes=2)
    async def update_player_list(self):
        try:
            players = self.get_players_from_ftp()
            
            embed = discord.Embed(
                title=f"Игроки онлайн ({len(players) if players else 0}/128)",
                color=0x00ff00,
                description=self.format_players(players)
            )

            if self.status_message:
                await self.status_message.edit(content="", embed=embed)
            else:
                channel = self.get_channel(self.channel_id)
                self.status_message = await channel.send(embed=embed)

        except Exception as e:
            print(f"Ошибка обновления: {str(e)}")

    def format_players(self, players):
        if not players:
            return "Сейчас никого нет на сервере"
            
        player_list = "\n".join([f"• {name}" for name in players])
        
        if len(player_list) > 4096:
            return "Слишком много игроков для отображения"
            
        return player_list

    @tasks.loop(minutes=2)
    async def update_status(self):
        try:
            players = self.get_players_from_ftp()
            count = len(players) if players else 0
            
            await self.change_presence(
                activity=discord.Activity(
                    type=discord.ActivityType.watching,
                    name=f"{count}/128 игроков"
                )
            )
        except Exception as e:
            print(f"Ошибка статуса: {str(e)}")

    async def on_ready(self):
        print(f"Бот {self.user} готов к работе!")

bot = ServerMonitorBot()

if __name__ == "__main__":
    bot.run(os.getenv('DISCORD_TOKEN'))