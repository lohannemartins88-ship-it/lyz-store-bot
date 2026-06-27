const { EmbedBuilder, AttachmentBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const QRCode = require('qrcode');

// Função pura para gerar o Copia e Cola do Pix padrão Banco Central (BRCode)
function gerarPayloadPix(chave, nomeObra, cidadeObra, valor) {
    const formatarCampo = (id, valorCampo) => {
        const tam = String(valorCampo).length.toString().padStart(2, '0');
        return `${id}${tam}${valorCampo}`;
    };

    const informacoesChave = formatarCampo('01', chave);
    const merchantAccount = `0014BR.GOV.BCB.PIX${informacoesChave}`;
    
    const valorStr = valor.toFixed(2);

    const payloadPrincipal = [
        formatarCampo('00', '01'), // Payload Format Indicator
        formatarCampo('26', merchantAccount), // Merchant Account Information
        formatarCampo('52', '0000'), // Merchant Category Code
        formatarCampo('53', '986'), // Transaction Currency (BRL)
        formatarCampo('54', valorStr), // Transaction Amount
        formatarCampo('58', 'BR'), // Country Code
        formatarCampo('59', nomeObra.substring(0, 25)), // Merchant Name
        formatarCampo('60', cidadeObra.substring(0, 15)), // Merchant City
        formatarCampo('62', formatarCampo('05', '***')) // Additional Data Field (TxID)
    ].join('');

    const payloadCompleto = `${payloadPrincipal}6304`;

    // Cálculo do CRC16 (Validação do Pix)
    let crc = 0xFFFF;
    for (let i = 0; i < payloadCompleto.length; i++) {
        crc ^= (payloadCompleto.charCodeAt(i) << 8);
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) {
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
            } else {
                crc = (crc << 1) & 0xFFFF;
            }
        }
    }
    const crcHex = crc.toString(16).toUpperCase().padStart(4, '0');
    return `${payloadCompleto}${crcHex}`;
}

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        if (!interaction.guild || !interaction.channel) return;
        if (!interaction.isButton()) return;

        const dados = global.dadosPedidos?.get(interaction.channel.id);
        const customId = interaction.customId;

        if (!['pagamento_chave_pix', 'pagamento_qrcode', 'pagamento_aprovar', 'pagamento_excluir'].includes(customId)) return;

        // 1. Chave PIX (Copia e Cola)
        if (customId === 'pagamento_chave_pix') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(err => console.error(err));
            
            if (!dados) return interaction.editReply({ content: '❌ Sessão do pedido não encontrada.' });
            const valorFinal = dados.precoAtual !== undefined ? dados.precoAtual : dados.precoOriginal;

            const copiaCola = gerarPayloadPix('lohannemartins88@gmail.com', 'LYZ STORE', 'PORTO SEGURO', valorFinal);

            const embedPix = new EmbedBuilder()
                .setColor('#FFB6C1')
                .setTitle('🎫 Pix Copia e Cola Gerado!')
                .setDescription(`Copie o código abaixo para pagar no aplicativo do seu banco:\n\n\`\`\`${copiaCola}\`\`\n\n**Chave E-mail:** \`lohannemartins88@gmail.com\``);

            return await interaction.editReply({ embeds: [embedPix] }).catch(err => console.error(err));
        }

        // 2. QR Code
        if (customId === 'pagamento_qrcode') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }).catch(err => console.error(err));

            if (!dados) return interaction.editReply({ content: '❌ Sessão do pedido não encontrada.' });
            const valorFinal = dados.precoAtual !== undefined ? dados.precoAtual : dados.precoOriginal;

            const copiaCola = gerarPayloadPix('lohannemartins88@gmail.com', 'LYZ STORE', 'PORTO SEGURO', valorFinal);

            const qrBuffer = await QRCode.toBuffer(copiaCola, { margin: 2, width: 300 });
            const attachment = new AttachmentBuilder(qrBuffer, { name: 'qrcode.png' });

            const embedQR = new EmbedBuilder()
                .setColor('#FFB6C1')
                .setTitle('📱 Escaneie o QR Code')
                .setDescription(`Abra o aplicativo do seu banco, escolha a opção "Pagar via QR Code" e aponte a câmera para a imagem abaixo ou tire print:`)
                .setImage('attachment://qrcode.png');

            return await interaction.editReply({ embeds: [embedQR], files: [attachment] }).catch(err => console.error(err));
        }

        // 3. Aprovar Pedido
        if (customId === 'pagamento_aprovar') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return await interaction.reply({ content: '❌ Apenas a gerência da Lyz Store pode aprovar pagamentos.', flags: [MessageFlags.Ephemeral] }).catch(err => console.error(err));
            }

            await interaction.deferUpdate().catch(err => console.error(err));

            const embedSucesso = new EmbedBuilder()
                .setColor('#F7DAF4')
                .setTitle('<:emoji_119:1520229725405053038> Compra Confirmada!')
                .setDescription(`**O pagamento do seu carrinho foi validado com sucesso pela administração, aguarde o suporte agora! <a:emoji12:1431834280421490748>**\n`)
                .setFooter({ text: 'Lyz Store ~ Agradecemos a preferência!' });

            return await interaction.editReply({ embeds: [embedSucesso], components: [] }).catch(err => console.error(err));
        }

        // 4. Excluir Carrinho
        if (customId === 'pagamento_excluir') {
            await interaction.reply({ content: '🗑️ O carrinho está sendo fechado e excluído...', flags: [MessageFlags.Ephemeral] }).catch(err => console.error(err));
            
            global.dadosPedidos?.delete(interaction.channel.id);
            
            setTimeout(() => {
                interaction.channel.delete().catch(err => console.error('Erro ao deletar canal:', err));
            }, 3000);
        }
    }
};