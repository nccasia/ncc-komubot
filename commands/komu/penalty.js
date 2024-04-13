const userData = require('../../models/userData');
const {
  sendMessageKomuToUser,
  sendErrorToDevTest,
} = require('../../util/komubotrest');
const { MessageActionRow, MessageButton, MessageEmbed } = require('discord.js');
const penatlyData = require('../../models/penatlyData');

// const checkIsNumber = (number) => {
//   return !isNaN(parseFloat(number)) && !isNaN(number - 0) && parseInt(number);
// };
const transAmmount = (ammout) => {
  ammout = ammout.toLowerCase();
  const lastString = ammout.slice(ammout.length - 1, ammout.length);
  const startString = ammout.slice(0, ammout.length - 1);

  const checkNumber = (string) =>
    !isNaN(parseFloat(string)) && !isNaN(string - 0);

  if (lastString == 'k' && checkNumber(startString)) {
    return startString * 1000;
  } else if (checkNumber(ammout)) {
    return checkNumber(ammout);
  }
};

const messHelp =
  '```' +
  '*penalty @username ammount<50k> reason' +
  '\n' +
  '*penalty summary' +
  '\n' +
  '*penalty detail @username' +
  '\n' +
  '*penalty clear' +
  '```';
module.exports = {
  name: 'penalty',
  description: 'penalty',
  cat: 'komu',
  async execute(message, args, client) {
    try {
      let authorId = message.author.id;
      if (args[0] === 'help') {
        return message.channel.send(messHelp);
      } else if (args[0] === 'summary') {
        const aggregatorOpts = [
          {
            $match: {
              is_reject: false,
              channel_id: message.channel.id,
              delete: { $ne: true },
            },
          },
          {
            $group: {
              _id: '$user_id',
              amount: { $sum: '$ammount' },
              username: { $first: '$username' },
            },
          },
          {
            $sort: {
              amount: -1,
            },
          },
        ];

        const result = await penatlyData.aggregate(aggregatorOpts);

        let mess;
        if (Array.isArray(result) && result.length === 0) {
          mess = '```' + 'no result' + '```';
        } else {
          mess = result
            .map((item) => `<@${item._id}>(${item.username}) : ${item.amount}`)
            .join('\n');
        }

        return message.channel
          .send('```' + 'Top bị phạt :' + '\n' + '```' + '\n' + mess)
          .catch(console.error);
      } else if (args[0] === 'detail') {
        // detail
        const checkMention = message.mentions.members.first();

        if (!checkMention) return message.channel.send(messHelp);
        let dataPen;
        if (checkMention.user.id) {
          dataPen = await penatlyData.find({
            user_id: checkMention.user.id,
            channel_id: message.channel.id,
          });
        } else {
          dataPen = await penatlyData.find({
            username: checkMention.user.username,
            channel_id: message.channel.id,
          });
        }

        if (!dataPen || (Array.isArray(dataPen) && dataPen.length === 0)) {
          return message.channel.send('```' + 'no result' + '```');
        }
        const mess = dataPen
          .map(
            (item, index) => `${index + 1} - ${item.reason} (${item.ammount})`
          )
          .join('\n');
        return message.channel
          .send(
            '```' + `Lý do ${dataPen[0].username} bị phạt` + '\n' + mess + '```'
          )
          .catch(console.error);
      } else if (args[0] === 'clear') {
        // clear
        await penatlyData.updateMany(
          { channel_id: message.channel.id, delete: { $ne: true } },
          { delete: true }
        );
        message
          .reply({
            content: 'Clear penalty successfully',
            ephemeral: true,
          })
          .catch((err) => {
            sendErrorToDevTest(client, authorId, err);
          });
      } else {
        const channel_id = message.channel.id;
        if (!args[0] || !args[1] || !args[2]) {
          return message.channel.send(messHelp);
        }
        const userArgs = message.mentions.members.first();
        const ammount = transAmmount(args[1]);
        if (!ammount || !userArgs) {
          return message.channel.send(messHelp);
        }
        const reason = args.slice(2, args.length).join(' ');

        let user;
        if (userArgs?.user.id) {
          user = await userData.findOne({
            id: userArgs.user.id,
            deactive: { $ne: true },
          });
        } else {
          user = await userData.findOne({
            username: userArgs.user.username,
            deactive: { $ne: true },
          });
        }
        if (!user) return message.channel.send('```' + 'no result' + '```');

        const newPenatly = new penatlyData({
          user_id: user.id,
          username: user.username,
          ammount,
          reason,
          createdTimestamp: Date.now(),
          is_reject: false,
          channel_id,
          delete: false,
        });
        const newPenatlyData = await newPenatly.save();
        message
          .reply({ content: '`✅` Penalty saved.', ephemeral: true })
          .catch((err) => {
            sendErrorToDevTest(client, authorId, err);
          });
        const embed = new MessageEmbed()
          .setColor('#0099ff')
          .setTitle('PENALTY')
          .setDescription(
            `You have been fined by ${message.author.username} ${ammount} for: ${reason}`
          );
        const row = new MessageActionRow().addComponents(
          new MessageButton()
            .setCustomId(`rejectpenalty${newPenatlyData._id}`)
            .setLabel('REJECT')
            .setStyle('DANGER')
        );

        const userSend = await sendMessageKomuToUser(
          client,
          {
            components: [row],
            embeds: [embed],
          },
          user.username
        );
        const filter = (interaction) =>
          interaction.customId === `rejectpenalty${newPenatlyData._id}`;

        let interaction;
        try {
          interaction = await userSend.dmChannel.awaitMessageComponent({
            filter,
            max: 1,
            time: 86400000,
            errors: ['time'],
          });
        } catch (error) {
          console.log(error);
        }

        if (interaction) {
          message.channel
            .send(`<@!${user.id}>(${user.username}) reject penalty`)
            .catch(console.error);
          await interaction.reply('Rejection sent!!!').catch((err) => {
            sendErrorToDevTest(client, authorId, err);
          });
          await penatlyData.updateOne(
            { _id: newPenatlyData._id },
            {
              is_reject: true,
            }
          );
        }
      }
    } catch (error) {
      console.log(error);
    }
  },
};
