const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-central')
        .setDescription('Envia a embed principal da Central de Compras da Lyz Store.'),
    
    async execute(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: 'Você não tem permissão para usar este comando.', ephemeral: true });
        }

        const embedPrincipal = new EmbedBuilder()
            .setColor('#FFB6C1') 
            .setTitle('**Comprar Robux ┆ Lyz Store <:robux:1431836604737261608>**')
            .setDescription(
                `Seja bem-vindo(a) à **Lyz Store**! Aqui você pode adquirir robux via **gamepass** com total segurança e agilidade. Abra seu carrinho abaixo! <a:U_8:1433151324798718134>\n\n` +
                `<:traoms:1431738922177790064> **Não** abra um ticket sem ter certeza da compra.\n` +
                `<:traoms:1431738922177790064> Certifique-se de estar de acordo com os **[Termos de Compra](https://discord.com/channels/1317689887729651722/1326089003195174965/1330581811901890681)**.\n` +
                `<:traoms:1431738922177790064> O prazo máximo para entrega do seu pedido é de **até 48 horas**.`
            )
            .addFields(
                { name: '<:emoji_35:1520233526950105259> Horário de Atendimento', value: '<a:b_relogiocdl:1520232917454946304> De segunda a domingo,\ndas **10:00 até 00:00**.', inline: true },
                { name: '<a:pastel3:1520234222286016642> Status da Loja', value: '<a:m_sino:1520234978028552252> **Loja Aberta!** Estamos\nprontos para atender você.', inline: true }
            )
            .setImage('https://i.imgur.com/SeuBannerAqui.png') 
            .setFooter({ text: '© Lyz Store ~ Sua lojinha de robux!' });

        const botaoAbrir = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('iniciar_ticket')
                .setLabel('Abrir Carrinho')
                .setEmoji('1431742884071342253')
                .setStyle(ButtonStyle.Success)
        );

        await interaction.reply({ content: 'Central configurada com sucesso!', ephemeral: true });
        await interaction.channel.send({ embeds: [embedPrincipal], components: [botaoAbrir] });
    },
};