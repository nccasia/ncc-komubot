const dailyData = require('../../models/dailyData.js');
const { sendErrorToDevTest } = require('../../util/komubotrest.js');
const axios = require('axios');
const { logTimeSheetFromDaily } = require('../../util/timesheet.js');

function setTime(date, hours, minute, second, msValue) {
  return date.setHours(hours, minute, second, msValue);
}

function checkTimeSheet() {
  let result = false;
  const time = new Date();
  const cur = new Date();
  const timezone = time.getTimezoneOffset() / -60;

  const fisrtTimeMorning = new Date(
    setTime(time, 0 + timezone, 30, 0, 0)
  ).getTime();
  const lastTimeMorning = new Date(
    setTime(time, 2 + timezone, 31, 0, 0)
  ).getTime();
  const fisrtTimeAfternoon = new Date(
    setTime(time, 5 + timezone, 0, 0, 0)
  ).getTime();
  const lastTimeAfternoon = new Date(
    setTime(time, 7 + timezone, 1, 0, 0)
  ).getTime();

  if (
    (cur.getTime() >= fisrtTimeMorning && cur.getTime() <= lastTimeMorning) ||
    (cur.getTime() >= fisrtTimeAfternoon && cur.getTime() <= lastTimeAfternoon)
  ) {
    result = true;
  }
  return result;
}

function checkTimeNotWFH() {
  let resultWfh = false;
  const time = new Date();
  const cur = new Date();
  const timezone = time.getTimezoneOffset() / -60;

  const fisrtTimeWFH = new Date(
    setTime(time, 0 + timezone, 30, 0, 0)
  ).getTime();
  const lastTimeWFH = new Date(setTime(time, 10 + timezone, 0, 0, 0)).getTime();

  if (cur.getTime() >= fisrtTimeWFH && cur.getTime() <= lastTimeWFH) {
    resultWfh = true;
  }
  return resultWfh;
}

function getUserNameByEmail(string) {
  if (string.includes('@ncc.asia')) {
    return string.slice(0, string.length - 9);
  }
}

const messHelp =
  '```' +
  'Daily Message Template:' +
  '\n\n' +
  '*daily [projectCode] [date]' +
  '\n' +
  '- yesterday: what you have done yesterday' +
  '\n' +
  "- today: what you're going to to today; [working time]" +
  '\n' +
  '- block: thing that blocks you ' +
  '\n\n' +
  '*daily help for more details' +
  '```';

const dailyHelp =
  '```' +
  'Daily meeting note, recap your daily work items and log timesheet automatically.' +
  '\n' +
  'Completed Daily Message Template:' +
  '\n\n' +
  '*daily [project code] [date]' +
  '\n' +
  '- yesterday: what you have done yesterday' +
  '\n' +
  "- today: what you're going to to today; [working time],[working type],[task type]" +
  '\n' +
  '- block: thing that blocks you' +
  '\n\n' +
  'Explanation' +
  '\n' +
  '-> project code: Ask your PM or use userinfo command to get the code. If no code provided, your default project will be selected.' +
  '\n' +
  '-> date: using "dd/mm/yyyy" format. "Today" by default.' +
  '\n' +
  '-> working time: Using "xh" format. x=1 by default.' +
  '\n' +
  '-> working type: nt for Normal Working Hour, ot for Overtime' +
  '\n' +
  '-> task type: As its name. Your default type will be selected if no type provided.' +
  '\n\n' +
  'Tips:' +
  '\n' +
  '- Details in the line "today" will be logged to your timesheet automatically.' +
  '\n' +
  '- Make sure that you selected the default task on timesheet tool.' +
  '\n' +
  '- Your projects can be listed by *userinfo or *timesheet help' +
  '\n' +
  '- Please review your timesheet to make sure that the information is correct' +
  '\n' +
  '- You can log multiple tasks for a project by using + as a splitter' +
  '\n' +
  '- If you want to daily for multiple projects, use *daily multiple times' +
  '```';
module.exports = {
  name: 'daily',
  description: 'WFH Daily',
  cat: 'komu',
  async execute(message, args, client) {
    try {
      if (args[0] === 'help') {
        return message
          .reply({
            content: dailyHelp,
            ephemeral: true,
          })
          .catch((err) => {
            sendErrorToDevTest(client, authorId, err);
          });
      } else {
        const authorId = message.author.id;
        const authorUsername = message.author.username;
        const daily = args.join(' ');
        const content = message.content;
        let checkDaily = false;
        const wordInString = (s, word) =>
          new RegExp('\\b' + word + '\\b', 'i').test(s);
        ['yesterday', 'today', 'block'].forEach((q) => {
          if (!wordInString(daily, q)) return (checkDaily = true);
        });
        const emailAddress = `${authorUsername}@ncc.asia`;

        if (checkDaily) {
          return message
            .reply({
              content: messHelp,
              ephemeral: true,
            })
            .catch((err) => {
              sendErrorToDevTest(client, authorId, err);
            });
        }

        if (!daily || daily == undefined) {
          return message
            .reply({
              content: '```Please add your daily text```',
              ephemeral: true,
            })
            .catch((err) => {
              sendErrorToDevTest(client, authorId, err);
            });
        }

        if (daily.length < 100) {
          return message
            .reply({
              content:
                '```Please enter at least 100 characters in your daily text```',
              ephemeral: true,
            })
            .catch((err) => {
              sendErrorToDevTest(client, authorId, err);
            });
        }

        // if (findPeriod(daily)) {
        //   return message
        //     .reply({
        //       content: '```Please chat with correct syntax```',
        //       ephemeral: true,
        //     })
        //     .catch((err) => {
        //       sendErrorToDevTest(client, authorId, err);
        //     });
        // }

        const date = new Date();
        let wfhGetApi;
        try {
          const url = date
            ? `${client.config.wfh.api_url}?date=${date.toDateString()}`
            : client.config.wfh.api_url;
          wfhGetApi = await axios.get(url, {
            headers: {
              securitycode: process.env.WFH_API_KEY_SECRET,
            },
          });
        } catch (error) {
          console.log(error);
        }

        const wfhUserEmail = wfhGetApi
          ? wfhGetApi.data.result.map((item) =>
              getUserNameByEmail(item.emailAddress)
            )
          : [];

        if (wfhUserEmail.includes(authorUsername)) {
          await new dailyData({
            userid: message.author.id,
            email:
              message.member != null || message.member != undefined
                ? message.member.displayName
                : message.author.username,
            daily: daily,
            createdAt: new Date(),
            channelid: message.channel.id,
          })
            .save()
            .catch((err) => console.log(err));

          await logTimeSheetFromDaily({
            emailAddress,
            content: content,
          });

          if (!checkTimeSheet()) {
            message
              .reply({
                content:
                  '```✅ Daily saved. (Invalid daily timeframe. Please daily at 7h30-9h30, 12h-14h. WFH not daily 20k/day.)```',
                ephemeral: true,
              })
              .catch((err) => {
                sendErrorToDevTest(client, authorId, err);
              });
          } else {
            message
              .reply({ content: '✅ Daily saved.', ephemeral: true })
              .catch((err) => {
                sendErrorToDevTest(client, authorId, err);
              });
          }
        } else {
          await new dailyData({
            userid: message.author.id,
            email:
              message.member != null || message.member != undefined
                ? message.member.displayName
                : message.author.username,
            daily: daily,
            createdAt: new Date(),
            channelid: message.channel.id,
          })
            .save()
            .catch((err) => console.log(err));

          await logTimeSheetFromDaily({
            emailAddress,
            content: content,
          });

          if (!checkTimeNotWFH()) {
            message
              .reply({
                content:
                  '```✅ Daily saved. (Invalid daily timeframe. Please daily at 7h30-17h. not daily 20k/day.)```',
                ephemeral: true,
              })
              .catch((err) => {
                sendErrorToDevTest(client, authorId, err);
              });
          } else {
            message
              .reply({ content: '`✅` Daily saved.', ephemeral: true })
              .catch((err) => {
                sendErrorToDevTest(client, authorId, err);
              });
          }
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
};
