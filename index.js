require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();

// Carregando comandos
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

const commandsArray = [];
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        commandsArray.push(command.data.toJSON());
    }
}

// Carregando eventos
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
}

client.once('ready', async () => {
    console.log(`🤖 Lyz Store Bot online como ${client.user.tag}!`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        // Se você quiser registrar instantaneamente em apenas um servidor específico para testes,
        // substitua a linha abaixo por: Routes.applicationGuildCommands(process.env.CLIENT_ID, "ID_DO_SEU_SERVIDOR")
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandsArray });
        console.log('✅ Comandos de barra registrados com sucesso!');
    } catch (error) {
        console.error(error);
    }
});

client.login(process.env.DISCORD_TOKEN);