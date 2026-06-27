const { EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (!interaction.guild || !interaction.channel) return;

        if (interaction.isButton()) {
            // Clicou no botão "Cupom" no carrinho
            if (interaction.customId === 'pedido_cupom') {
                if (interaction.replied || interaction.deferred) return;

                const modal = new ModalBuilder()
                    .setCustomId('modal_aplicar_cupom')
                    .setTitle('Aplicar Cupom de Desconto');

                const cupomInput = new TextInputBuilder()
                    .setCustomId('cupom_texto')
                    .setLabel('Digite o código do cupom:')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder('Ex: LYZ10');

                modal.addComponents(new ActionRowBuilder().addComponents(cupomInput));
                await interaction.showModal(modal).catch(err => console.error(err));
                return;
            }
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'modal_aplicar_cupom') {
                if (interaction.replied || interaction.deferred) return;
                
                // Dá o adiamento silencioso para preservar o fluxo e evitar travamentos
                await interaction.deferUpdate().catch(err => console.error(err));

                const cupomTexto = interaction.fields.getTextInputValue('cupom_texto').toUpperCase().trim();
                const dados = global.dadosPedidos.get(interaction.channel.id);

                if (!dados) {
                    return await interaction.followUp({ content: '❌ Dados do pedido não encontrados neste canal.', flags: [MessageFlags.Ephemeral] }).catch(err => console.error(err));
                }

                if (dados.cupomAplicado) {
                    return await interaction.followUp({ content: '❌ Você já aplicou um cupom de desconto neste carrinho.', flags: [MessageFlags.Ephemeral] }).catch(err => console.error(err));
                }

                // Busca o cupom criado pelo comando admin
                const cupomConfig = global.cuponsAtivos?.get(cupomTexto);
                if (!cupomConfig) {
                    return await interaction.followUp({ content: '❌ Cupom inválido ou expirado.', flags: [MessageFlags.Ephemeral] }).catch(err => console.error(err));
                }

                // Verifica se o limite máximo de usos configurado estourou
                if (cupomConfig.usosAtuais >= cupomConfig.maxUsos) {
                    return await interaction.followUp({ content: '❌ Este cupom já esgotou o limite de utilizações.', flags: [MessageFlags.Ephemeral] }).catch(err => console.error(err));
                }

                // Processa o cálculo do desconto
                let desconto = 0;
                if (cupomConfig.tipo === 'porcentagem') {
                    desconto = (dados.precoOriginal * cupomConfig.valor) / 100;
                } else if (cupomConfig.tipo === 'fixo') {
                    desconto = cupomConfig.valor;
                }

                let novoPreco = dados.precoOriginal - desconto;
                if (novoPreco < 0) novoPreco = 0;

                // Salva de forma limpa via Merge mantendo os outros dados da Gamepass vivos
                dados.precoAtual = novoPreco;
                dados.cupomAplicado = cupomTexto;
                global.dadosPedidos.set(interaction.channel.id, dados);

                // Incrementa a contagem de uso do cupom do parceiro
                cupomConfig.usosAtuais += 1;
                global.cuponsAtivos.set(cupomTexto, cupomConfig);

                // Reconstrói o painel com o valor atualizado e a indicação do cupom ativo preservando botões
                const embedDetalhesAtualizado = new EmbedBuilder()
                    .setColor('#FFB6C1')
                    .setTitle('<:glt_bearitimaliaaa:1431736766993268997> Detalhes da sua Compra:')
                    .setDescription(
                        `\n` +
                        `<:user:1495098245431689444> **Usuário Roblox:** \`${dados.usuario}\`\n` +
                        `🎁 **Gamepass:** \`${dados.gamepass}\` (\`${dados.gamepassId || 'N/A'}\`)\n` +
                        `⚫ **Quantia de robux:** \`${dados.valorTaxado} (recebe ${dados.quantidadeRobux})\`\n` +
                        `💰 **Preço Total:** ~~R$ ${dados.precoOriginal.toFixed(2).replace('.', ',')}~~ ➔ \`R$ ${novoPreco.toFixed(2).replace('.', ',')}\`\n` +
                        `🎫 **Cupom Ativo:** \`${cupomTexto}\`\n\n` +
                        `**Se tudo estiver correto, confirme o pedido abaixo.**`
                    )
                    .setFooter({ text: '© Lyz Store ~ Sua lojinha de robux!' });

                const botoesPedido = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('pedido_confirmar')
                        .setLabel('Confirmar Pedido')
                        .setEmoji('1495097441622425870')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('pedido_cupom')
                        .setLabel('Cupom')
                        .setEmoji('1519848076607754401')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true), // Desativa após aplicar com sucesso
                    new ButtonBuilder()
                        .setCustomId('gamepass_prosseguir_painel')
                        .setLabel('Alterar Pedido')
                        .setStyle(ButtonStyle.Primary)
                );

                await interaction.editReply({ embeds: [embedDetalhesAtualizado], components: [botoesPedido] }).catch(err => console.error(err));
            }
        }
    }
};