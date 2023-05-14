const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();
//1
app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  let hashedPassword = await bcrypt.hash(password, 10);
  let selectUserQuery = `
            SELECT *
            FROM
            user
            WHERE
                username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `
                INSERT INTO
                user(username,name,password,gender)
                VALUES(
                    '${username}',
                    '${name}',
                    '${hashedPassword}',
                    '${gender}'
                );`;
      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
            SELECT *
            FROM
            user
            WHERE
                username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched) {
      payload = { username: username, userId: dbUser.user_id };
      jwtToken = jwt.sign(payload, "SECRET");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//authenticateToken
const authenticateToken = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;
        next();
      }
    });
  }
};
const getFollowingUserIds = async (username) => {
  const getFollowingIds = `
            SELECT following_user_id
            FROM
            follower INNER JOIN user
            ON user.user_id=follower.follower_user_id
            WHERE
                username='${username}';`;
  const followingPeople = await db.all(getFollowingIds);
  const arrayOfIds = followingPeople.map(
    (eachUser) => eachUser.following_user_id
  );
  return arrayOfIds;
};
//api3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  const followingPeopleIds = await getFollowingUserIds(username);
  console.log(followingPeopleIds);
  const getTweetsQuery = `
            SELECT 
            username,tweet,date_time AS dateTime
            FROM user INNER JOIN tweet
            ON user.user_id=tweet.user_id
            WHERE
             user.user_id IN (${followingPeopleIds})
            ORDER BY date_time DESC
            LIMIT 4;`;
  const data = await db.all(getTweetsQuery);
  response.send(data);
});

//api4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  const getNamesQuery = `
            SELECT name
            FROM
            follower INNER JOIN user
            ON user.user_id=follower.following_user_id
            WHERE
                follower_user_id=${userId};`;
  const data = await db.all(getNamesQuery);
  response.send(data);
});

//api5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  const getNamesQuery1 = `
            SELECT name
            FROM
            follower INNER JOIN user
            ON user.user_id=follower.follower_user_id
            WHERE
                following_user_id='${userId}';`;
  const data = await db.all(getNamesQuery1);
  response.send(data);
});

const tweetAuthentication = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getTweetQuery = `
            SELECT *
            FROM
            tweet INNER JOIN follower
            ON tweet.user_id=follower.following_user_id
            WHERE
                tweet.tweet_id=${tweetId} AND follower.follower_user_id=${userId};`;
  const dbUser = await db.get(getTweetQuery);
  if (dbUser === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

//api 6
app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  tweetAuthentication,
  async (request, response) => {
    const { username, userId } = request;
    const { tweetId } = request.params;
    const getTweetQuery = `
            SELECT tweet,
            (SELECT count() FROM like WHERE tweet_id=${tweetId}) AS likes,
            (SELECT count() FROM reply WHERE tweet_id=${tweetId}) AS replies,
            date_time AS dateTime
            FROM tweet
            WHERE tweet.tweet_id=${tweetId};`;
    const data = await db.get(getTweetQuery);
    response.send(data);
  }
);

//api 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  tweetAuthentication,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetQuery = `
            SELECT username
            FROM user INNER JOIN like
            ON user.user_id=like.user_id
            WHERE tweet_id=${tweetId};`;
    const data = await db.all(getTweetQuery);
    const arrayOfNames = data.map((eachUser) => eachUser.username);
    response.send({ likes: arrayOfNames });
  }
);

//api 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  tweetAuthentication,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetQuery = `
            SELECT name,reply
            FROM user INNER JOIN reply
            ON user.user_id=reply.user_id
            WHERE tweet_id=${tweetId};`;
    const data = await db.all(getTweetQuery);
    response.send({ replies: data });
  }
);

//api 10
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  console.log(userId);
  const getTweets = `
            SELECT tweet,
            COUNT(DISTINCT like_id) AS likes,
            COUNT(DISTINCT reply_id) AS replies,
            date_time AS dateTime
            FROM tweet LEFT JOIN reply ON tweet.tweet_id=reply.tweet_id
            LEFT JOIN like ON tweet.tweet_id=like.tweet_id
            WHERE tweet.user_id=${userId}
            GROUP BY tweet.tweet_id;`;
  const data = await db.all(getTweets);
  response.send(data);
});

//api 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { userId } = request;
  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");
  const postQuery = `
            INSERT INTO
                tweet(tweet,user_id,date_time)
            VALUES(
                '${tweet}',
                '${userId}',
                '${dateTime}'
            );`;
  await db.run(postQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username, userId } = request;
    const { tweetId } = request.params;
    const selectTweetQuery = `
            SELECT * FROM tweet WHERE user_id='${userId}' AND tweet_id='${tweetId}';`;
    const tweet = await db.get(selectTweetQuery);
    if (tweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteQuery = `
                DELETE FROM tweet WHERE tweet_id=${tweetId};`;
      await db.run(deleteQuery);
      response.send("Tweet Removed");
    }
  }
);
module.exports = app;
