import discord
from discord.ext import commands, tasks
import a2s
import os

class ServerMonitorBot(commands.Bot):
    def __init__(self):
        super().__init__(
            command_prefix="!",
            intents=discord.Intents.all(),
            help_command=None
        )
        self.server_address = (os.getenv('SERVER_IP'), int(os.getenv('SERVER_PORT')))
        self.channel_id = int(os.getenv('CHANNEL_ID'))  # ID канала для сообщения
        self.status_message = None  # Для хранения сообщения

    async def setup_hook(self):
        self.update_status.start()
        self.update_player_list.start()
        
        # Находим канал и отправляем первоначальное сообщение
        channel = self.get_channel(self.channel_id)
        if channel:
            self.status_message = await channel.send("Загрузка данных...")

    @tasks.loop(minutes=2)
    async def update_player_list(self):
        try:
            players = await self.get_players()
            server_info = a2s.info(self.server_address)
            
            embed = discord.Embed(
                title=f"Игроки онлайн ({len(players)}/{server_info.max_players})",
                color=0x00ff00,
                description=self.format_players(players)
            )

            if self.status_message:
                await self.status_message.edit(content="", embed=embed)
            else:
                channel = self.get_channel(self.channel_id)
                self.status_message = await channel.send(embed=embed)

        except Exception as e:
            print(f"Ошибка обновления списка: {e}")

    def format_players(self, players):
        if not players:
            return "Сейчас никого нет на сервере"
            
        player_list = "\n".join([f"• {p.name}" for p in players])
        
        # Обрезаем если слишком длинный список
        if len(player_list) > 4096:
            return player_list[:4000] + "\n... (список слишком большой)"
            
        return player_list

    async def get_players(self):
        try:
            return a2s.players(self.server_address)
        except Exception as e:
            print(f"Ошибка запроса: {e}")
            return None

    @tasks.loop(minutes=2)
    async def update_status(self):
        try:
            server_info = a2s.info(self.server_address)
            players = a2s.players(self.server_address)
            
            await self.change_presence(
                activity=discord.Activity(
                    type=discord.ActivityType.playing,
                    name=f"{len(players)}/{server_info.max_players} | Server 1 (1pp)"
                )
            )
        except Exception as e:
            print(f"Ошибка статуса: {e}")

    async def on_ready(self):
        print(f"Бот {self.user} готов к работе!")

bot = ServerMonitorBot()

if __name__ == "__main__":
    bot.run(os.getenv('DISCORD_TOKEN'))