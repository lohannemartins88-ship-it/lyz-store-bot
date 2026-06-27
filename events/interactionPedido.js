const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        if (!interaction.guild || !interaction.channel) return;

        if (interaction.isButton() && interaction.customId === 'pedido_confirmar') {
            await interaction.deferUpdate().catch(err => console.error(err));

            const dados = global.dadosPedidos?.get(interaction.channel.id);
            if (!dados) {
                return await interaction.followUp({ content: '❌ Dados do pedido não encontrados.', flags: [MessageFlags.Ephemeral] }).catch(err => console.error(err));
            }

            // Garante que o preço atual reflete qualquer cupom já aplicado
            const precoFinal = dados.precoAtual !== undefined ? dados.precoAtual : dados.precoOriginal;

            const embedPagamento = new EmbedBuilder()
                .setColor('#FFB6C1')
                .setTitle('Pedido confirmado <:emoji_119:1520229725405053038>')
                .setDescription(
                    `**Por favor, faça o pagamento via PIX e mande o comprovante no chat:**\n\n` +
                    `<:user:1495098245431689444> **Usuário Roblox:** \`${dados.usuario}\`\n` +
                    `<:robux:1431836604737261608> **Quantia de Robux:** \`${dados.valorTaxado} (recebe ${dados.quantidadeRobux})\`\n` +
                    `<a:emoji3:1519874879976116388> **Valor Final:** \`R$ ${precoFinal.toFixed(2).replace('.', ',')}\`\n` +
                    (dados.cupomAplicado ? `<:cupom:1477291290566721536> **Cupom Utilizado:** \`${dados.cupomAplicado}\`\n` : '') + `\n` +
                    `↳ **Por favor, envie o comprovante completo, mostrando o nome de quem pagou.**\n` +
                    `*Caso não envie o comprovante, você estará sujeito a todos os termos descrito ao abrir o ticket.*`
                )
                .setFooter({ text: '© Lyz Store ~ Sua lojinha de robux!' });

            const botoesPagamento = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('pagamento_chave_pix')
                    .setLabel('Chave PIX')
                    .setEmoji('1519848076607754401')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('pagamento_qrcode')
                    .setLabel('QR Code')
                    .setEmoji('1334188819846791209')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('pagamento_aprovar')
                    .setLabel('Aprovar')
                    .setEmoji('1495097441622425870')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('pagamento_excluir')
                    .setEmoji('1519851471972077688')
                    .setStyle(ButtonStyle.Danger)
            );

            await interaction.editReply({ embeds: [embedPagamento], components: [botoesPagamento] }).catch(err => console.error(err));
        }
    }
};