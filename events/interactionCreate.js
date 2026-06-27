const { 
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits,
    ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags 
} = require('discord.js');
const axios = require('axios');

// Inicialização segura do Map Global
global.dadosPedidos = global.dadosPedidos || new Map();

// Função auxiliar com Retry Estruturado para APIs do Roblox
async function robloxRequestWithRetry(config, retries = 2, delay = 1000) {
    try {
        return await axios(config);
    } catch (error) {
        const status = error.response ? error.response.status : null;
        if (status && [400, 403, 404].includes(status)) {
            throw error;
        }
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
            return robloxRequestWithRetry(config, retries - 1, delay * 1.5);
        }
        throw error;
    }
}

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (!interaction.guild || !interaction.channel) return;

        // --- 1. SE FOR UM COMANDO DE BARRA ---
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error('[Erro Comando]:', error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'Ocorreu um erro ao executar esse comando!', flags: [MessageFlags.Ephemeral] });
                }
            }
            return;
        }

        // --- 2. SE FOR INTERAÇÃO DE BOTÃO ---
        if (interaction.isButton()) {
            
            // ETAPA 2: Clicou no botão inicial da Central
            if (interaction.customId === 'iniciar_ticket') {
                if (interaction.replied || interaction.deferred) return;
                const embedTermos = new EmbedBuilder()
                    .setColor('#FFB6C1')
                    .setTitle('Concorde com os Termos')
                    .setDescription('Antes de realizar sua compra, concorde com os os **Termos de Compra**.');

                const botoesEtapa2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirmar_abrir_ticket')
                        .setLabel('Abrir Carrinho')
                        .setEmoji('1431742884071342253')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setLabel('Ver Termos')
                        .setEmoji('1519848076607754401')
                        .setStyle(ButtonStyle.Link)
                        .setURL('https://discord.com/channels/1317689887729651722/1326089003195174965')
                );

                try {
                    await interaction.reply({ embeds: [embedTermos], components: [botoesEtapa2], flags: [MessageFlags.Ephemeral] });
                } catch (err) {
                    console.error('[Erro ao responder iniciar_ticket]:', err);
                }
                return;
            }

            // ETAPA 3: Clicou em "Abrir Ticket" após os termos (Criação do Carrinho)
            if (interaction.customId === 'confirmar_abrir_ticket') {
                if (interaction.replied || interaction.deferred) return;
                await interaction.deferUpdate().catch(err => console.error(err));

                const guild = interaction.guild;
                const safeUsername = (interaction.user.username || 'user').replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 20);
                const nomeCanal = `carrinho-${safeUsername || 'ticket'}`;

                try {
                    const canalTicket = await guild.channels.create({
                        name: nomeCanal,
                        type: ChannelType.GuildText,
                        parent: process.env.CATEGORY_TICKETS_ID || null,
                        permissionOverwrites: [
                            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
                        ],
                    });

                    const embedSucesso = new EmbedBuilder()
                        .setColor('#FFB6C1')
                        .setDescription(` <a:emoji12:1431834280421490748> **Seu carrinho foi criado com sucesso!**\n<:traoms:1431738922177790064> Clique no botão abaixo para ser **redirecionado** ao seu carrinho.`);

                    const botaoLink = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setLabel('Ir para o carrinho')
                            .setEmoji('1431742884071342253')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`https://discord.com/channels/${guild.id}/${canalTicket.id}`)
                    );

                    await interaction.followUp({ embeds: [embedSucesso], components: [botaoLink], flags: [MessageFlags.Ephemeral] }).catch(err => console.error(err));

                    const embedPainelTicket = new EmbedBuilder()
                        .setColor('#FFB6C1')
                        .setTitle('Comprar Robux')
                        .setDescription(
                            ` **<a:emoji12:1431834280421490748> Seja bem-vindo ao seu carrinho! Aqui você pode comprar robux para sua conta.**\n\n` +
                            `**Siga as informações abaixo:**\n` +
                            `↳ **Informe no botão abaixo o seu usuário no Roblox. Após isso, confirme se é você clicando em "Sim, sou eu".<:emoji_119:1520229725405053038>**\n\n` +
                            `<:m_change:1429177787700351167> **Caso o seu nome de usuário no Roblox esteja incorreto, clique em "Não, quero corrigir" e coloque o usuário correto.**`
                        )
                        .setFooter({ text: '© Lyz Store ~ sua lojinha de robux!' });

                    const botoesPainel = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('inserir_usuario_roblox')
                            .setLabel('Usuário no Roblox')
                            .setEmoji('1495098245431689444')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('deletar_carrinho')
                            .setEmoji('1334263989034815528')
                            .setStyle(ButtonStyle.Secondary)
                    );

                    await canalTicket.send({ content: `<@${interaction.user.id}>`, embeds: [embedPainelTicket], components: [botoesPainel] }).catch(err => console.error(err));

                } catch (err) {
                    console.error('[Erro Criação Canal]:', err);
                    await interaction.followUp({ content: '⚠️ Erro ao criar o canal de ticket. Verifique as permissões do bot.', flags: [MessageFlags.Ephemeral] }).catch(err => console.error(err));
                }
                return;
            }

            if (interaction.customId === 'deletar_carrinho') {
                if (interaction.replied || interaction.deferred) return;
                await interaction.reply({ content: 'Este carrinho será fechado em 5 segundos...', flags: [MessageFlags.Ephemeral] }).catch(err => console.error(err));
                setTimeout(() => {
                    if (interaction.channel && typeof interaction.channel.delete === 'function') {
                        global.dadosPedidos.delete(interaction.channel.id);
                        interaction.channel.delete().catch(err => console.error('[Erro ao deletar canal]:', err));
                    }
                }, 5000);
                return;
            }

            if (interaction.customId === 'inserir_usuario_roblox') {
                if (interaction.replied || interaction.deferred) return;
                const modal = new ModalBuilder()
                    .setCustomId('modal_roblox')
                    .setTitle('Usuário do Roblox');

                const robloxInput = new TextInputBuilder()
                    .setCustomId('roblox_username')
                    .setLabel('Informe seu nome de usuário do Roblox:')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder('Ex: manufofinha123');

                modal.addComponents(new ActionRowBuilder().addComponents(robloxInput));
                await interaction.showModal(modal).catch(err => console.error(err));
                return;
            }

            if (interaction.customId === 'corrigir_usuario_roblox') {
                if (interaction.replied || interaction.deferred) return;
                const modal = new ModalBuilder()
                    .setCustomId('modal_roblox')
                    .setTitle('Alterar usuário do Roblox');

                const robloxInput = new TextInputBuilder()
                    .setCustomId('roblox_username')
                    .setLabel('Informe seu nome de usuário do Roblox:')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder('Ex: manufofinha123');

                modal.addComponents(new ActionRowBuilder().addComponents(robloxInput));
                await interaction.showModal(modal).catch(err => console.error(err));
                return;
            }

            if (interaction.customId === 'confirmar_usuario_correto') {
                if (interaction.replied || interaction.deferred) return;
                await interaction.deferUpdate().catch(err => console.error(err));

                const embedGamepass = new EmbedBuilder()
                    .setColor('#FFB6C1')
                    .setTitle('CRIAÇÃO DA GAMEPASS!')
                    .setDescription(
                        `<:traoms:1431738922177790064> **Crie a sua gamepass com o valor correto e depois clique em Prosseguir.**\n\n` +
                        `<:traoms:1431738922177790064> **Você também pode ver o passo a passo de como criar e configurar clicando no botão (Tutorial Gamepass).**\n\n` +
                        `<:traoms:1431738922177790064> **Compra mínima: 100 robux. Caso tenha dúvidas, abra um ticket de suporte em <#1324083599993077841>.**`
                    )
                    .setFooter({ text: '© Lyz Store sua lojinha de robux' });

                const botoesGamepass = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('gamepass_prosseguir_painel')
                        .setLabel('Já criei a gamepass / Prosseguir')
                        .setEmoji('1429177787700351167')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setLabel('Tutorial Gamepass')
                        .setEmoji('1332421740097441845')
                        .setStyle(ButtonStyle.Link)
                        .setURL('https://discord.com/channels/1317689887729651722/1519873159678005379'),
                    new ButtonBuilder()
                        .setCustomId('gamepass_calculadora')
                        .setLabel('Calculadora')
                        .setEmoji('1495095690135732335')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('corrigir_usuario_roblox')
                        .setLabel('Mudar Nick do Roblox')
                        .setEmoji('1495098245431689444')
                        .setStyle(ButtonStyle.Secondary)
                );

                await interaction.editReply({ embeds: [embedGamepass], components: [botoesGamepass] }).catch(err => console.error(err));
                return;
            }
        }

        // --- 3. RECEBENDO AS INFORMAÇÕES DO MODAL DO ROBLOX ---
        if (interaction.isModalSubmit() && interaction.customId === 'modal_roblox') {
            if (interaction.replied || interaction.deferred) return;
            await interaction.deferReply().catch(err => console.error(err));
            
            const rawUsername = interaction.fields.getTextInputValue('roblox_username');
            const usernameInput = rawUsername ? rawUsername.trim() : '';

            if (!usernameInput || usernameInput.length === 0) {
                return await interaction.editReply({ content: '❌ O nome de usuário do Roblox não pode estar vazio.' }).catch(err => console.error(err));
            }

            try {
                const cacheExistente = global.dadosPedidos.get(interaction.channel.id);
                let id, name, displayName;

                if (cacheExistente && cacheExistente.robloxUsername && cacheExistente.robloxUsername.toLowerCase() === usernameInput.toLowerCase()) {
                    id = cacheExistente.robloxId;
                    name = cacheExistente.robloxUsername;
                    displayName = cacheExistente.robloxDisplayName;
                } else {
                    const userRes = await robloxRequestWithRetry({
                        method: 'post',
                        url: 'https://users.roblox.com/v1/usernames/users',
                        data: { usernames: [usernameInput], excludeBannedUsers: false },
                        timeout: 6000
                    });
                    
                    if (!userRes.data || !userRes.data.data || userRes.data.data.length === 0) {
                        return await interaction.editReply({ content: '❌ Usuário não encontrado no Roblox. Verifique a escrita e tente novamente.' }).catch(err => console.error(err));
                    }

                    id = userRes.data.data[0].id;
                    name = userRes.data.data[0].name;
                    displayName = userRes.data.data[0].displayName || name;
                }

                const thumbRes = await robloxRequestWithRetry({
                    method: 'get',
                    url: `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png&isCircular=false`,
                    timeout: 5000
                }).catch(() => null);
                
                const avatarUrl = thumbRes?.data?.data?.[0]?.imageUrl || 'https://i.imgur.com/wH6Lp4g.png';

                const dadosAtuais = global.dadosPedidos.get(interaction.channel.id) || {};
                global.dadosPedidos.set(interaction.channel.id, {
                    ...dadosAtuais,
                    robloxId: id,
                    robloxUsername: name,
                    robloxDisplayName: displayName
                });

                const embedRobloxInfo = new EmbedBuilder()
                    .setColor('#FFB6C1')
                    .setTitle(`${interaction.user.username} | Sua conta do Roblox:`)
                    .addFields(
                        { name: 'Nome de Usuário', value: `${name}`, inline: true },
                        { name: 'Nome de Exibição', value: `${displayName}`, inline: true },
                        { name: 'ID do Usuário', value: `${id}`, inline: true }
                    )
                    .setThumbnail(avatarUrl)
                    .setFooter({ text: '© Lyz Store ~ Sua lojinha de robux!' });

                const botoesConfirmacao = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirmar_usuario_correto')
                        .setLabel('Sim, esse sou eu')
                        .setEmoji('1495097441622425870')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('corrigir_usuario_roblox')
                        .setLabel('Não, quero mudar')
                        .setEmoji('1429177787700351167')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('deletar_carrinho')
                        .setEmoji('1334263989034815528')
                        .setStyle(ButtonStyle.Secondary)
                );

                await interaction.editReply({ 
                    content: `<@${interaction.user.id}> Aqui estão algumas informações sobre sua conta do Roblox:`, 
                    embeds: [embedRobloxInfo], 
                    components: [botoesConfirmacao] 
                }).catch(err => console.error(err));

            } catch (error) {
                console.error('[Erro API Roblox User]:', error);
                await interaction.editReply({ content: '⚠️ Erro ao conectar com a API do Roblox. Tente novamente mais tarde.' }).catch(err => console.error(err));
            }
        }
    },
};