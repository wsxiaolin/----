const dataPath = "./2025/winter"; // 数据存储的文件夹
const fs = require('fs'); // 引入文件系统模块
const path = require('path'); // 引入路径模块

const Pl = require("physics-lab-web-api");
Pl.setConfig({ consolelog: false });
const User = Pl.User;
const projects = require(`${dataPath}/projects.js`);
const skipUsers = new Set(require(`${dataPath}/skipList.js`)); // 确保 skipUsers 是一个 Set 对象
const list = new Map(); // 统计列表，统计每个作品得了哪几票
const map = new Map(); // 统计用户投了几票
const result = new Map();
const authors = new Set(); // 作品发布者（参选者）无投票权

// 是否符合投票要求
async function isOldTimer(id, pl) {
  const re = await pl.auth.getUser(id);
  return (
    re.Data.Statistic.ExperimentCount >= 10 &&
    (Date.now() / 1000 - parseInt(id.substring(0, 8), 16)) / (30 * 24 * 60 * 60) > 3
  );
}

async function main() {
  const pl = new User(process.env.ADMIN, process.env.PASSWORD);
  await pl.auth.login();

  // 提前获取所有作者
  const authorsPromises = projects.map(async (item) => {
    const getSummary = await pl.projects.getSummary(item, "Discussion");
    const author = getSummary.Data.User.ID;
    authors.add(author);
  });
  await Promise.all(authorsPromises);

  // 这里先得到每个用户投了几票
  const promises = projects.map(async (item) => {
    const getSupporters = await pl.projects.getSupporters(item, "Discussion", 50);
    const supports = getSupporters.Data.$values;
    list.set(item, supports);

    await Promise.all(
      supports.map(async (user) => {
        let logMessage = '';
        if (authors.has(user.ID)) {
          logMessage = "参选者投票，无效";
          console.log("\x1b[34m%s\x1b[0m", logMessage, user.Nickname);
        }
        if (skipUsers.has(user.ID)) {
          logMessage = "无效票";
          console.log("\x1b[34m%s\x1b[0m", logMessage, user.Nickname);
        } else {
          if (await isOldTimer(user.ID, pl)) {
            logMessage = "有效票";
            console.log("\x1b[32m%s\x1b[0m", logMessage, user.Nickname);
            if (map.has(user.ID)) {
              map.set(user.ID, map.get(user.ID) + 1);
            } else {
              map.set(user.ID, 1);
            }
          } else {
            if (!map.has(user.ID)) map.set(user.ID, 0);
            logMessage = "无效票";
            console.log("\x1b[31m%s\x1b[0m", logMessage, user.Nickname);
          }
        }
        // 写入日志到文件
        const logFilePath = path.join(dataPath, "record",`${new Date().getMonth() + 1}月${new Date().getDate()}日${new Date().getHours()}点${new Date().getMinutes()}分.txt`);
        fs.appendFileSync(logFilePath, `${logMessage} ${user.Nickname}\n`);
      })
    );
  });

  // 等待所有票检完成
  await Promise.all(promises);
  console.log("----各用户投票状况(用于加权)----", map);
  const logFilePath = path.join(dataPath, "record", `${new Date().getMonth() + 1}月${new Date().getDate()}日${new Date().getHours()}点${new Date().getMinutes()}分.txt`);
  fs.appendFileSync(logFilePath, `----各用户投票状况(用于加权)---- ${JSON.stringify(Object.fromEntries(map))}\n`);

  console.log("所有作品均已完成验票");

  async function processProjects() {
    for (const [project, supports] of list.entries()) {
      let 票数 = 1; // 规定，每个参选者默认有一票
      for (const user of supports) {
        if (map.get(user.ID) > 0) {
          票数 += 1 / map.get(user.ID); // 参选者实际得票
        }
      }
      // 获取作者名称
      const getSummary = await pl.projects.getSummary(project, "Discussion");
      const author = getSummary.Data.User.Nickname;
      console.log(author);
      result.set(`<discussion=${project}>${author}</discussion>`, 票数);
      fs.appendFileSync(logFilePath, `${author} - ${票数}\n`);
    }
  }

  // 调用异步函数
  processProjects()
    .then(() => {
      console.log("处理完成");
      console.log(result);
      fs.appendFileSync(logFilePath, `处理完成\n${JSON.stringify(Object.fromEntries(result))}\n`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("处理过程中出错:", error);
      fs.appendFileSync(logFilePath, `处理过程中出错: ${error}\n`);
    });
}

main();