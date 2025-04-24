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
        self.status_message_id = None  # Храним только ID сообщения
        self.message_file = "last_message.txt"

    async def setup_hook(self):
        # Загружаем ID последнего сообщения при запуске
        await self.load_last_message_id()
        self.update_status.start()
        self.update_player_list.start()

    async def load_last_message_id(self):
        try:
            with open(self.message_file, "r") as f:
                self.status_message_id = int(f.read())
        except (FileNotFoundError, ValueError):
            self.status_message_id = None

    async def save_last_message_id(self, message_id):
        with open(self.message_file, "w") as f:
            f.write(str(message_id))
        self.status_message_id = message_id

    async def get_or_create_message(self):
        channel = self.get_channel(self.channel_id)
        if not channel:
            return None

        try:
            # Пытаемся получить существующее сообщение
            if self.status_message_id:
                return await channel.fetch_message(self.status_message_id)
        except discord.NotFound:
            # Сообщение было удалено - создаем новое
            message = await channel.send("Инициализация...")
            await self.save_last_message_id(message.id)
            return message
        except discord.Forbidden:
            print("Нет прав доступа к сообщению")
            return None

        # Если сообщения нет - создаем новое
        message = await channel.send("Инициализация...")
        await self.save_last_message_id(message.id)
        return message

    def get_players_from_ftp(self):
        try:
            with FTP() as ftp:
                ftp.connect(self.ftp_config["host"], self.ftp_config["port"])
                ftp.login(self.ftp_config["user"], self.ftp_config["password"])
                
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
            message = await self.get_or_create_message()
            if not message:
                return

            players = self.get_players_from_ftp()
            
            embed = discord.Embed(
                title=f"Игроки онлайн ({len(players) if players else 0}/128)",
                color=0x00ff00,
                description=self.format_players(players)
            )

            await message.edit(content="", embed=embed)

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
                    type=discord.ActivityType.playing,
                    name=f"{count}/128 | server 1 (1pp)"
                )
            )
        except Exception as e:
            print(f"Ошибка статуса: {str(e)}")

    async def on_ready(self):
        print(f"Бот {self.user} готов к работе!")

bot = ServerMonitorBot()

if __name__ == "__main__":
    bot.run(os.getenv('DISCORD_TOKEN'))