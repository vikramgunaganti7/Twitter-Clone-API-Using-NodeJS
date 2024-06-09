const express = require('express')
const app = express()

const sqlite3 = require('sqlite3')
const {open} = require('sqlite')

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const path = require('path')
const dbPath = path.join(__dirname, 'twitterClone.db')

let db = null
app.use(express.json())

const initlizeDBAndServer = async () => {
  try {
    db = await open({filename: dbPath, driver: sqlite3.Database})
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error ${e.message}`)
    process.exit(1)
  }
}

initlizeDBAndServer()

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const passwordLength = password.length
  if (passwordLength < 6) {
    response.status(400)
    response.send('Password is too short')
  } else {
    const userQuery = `SELECT * FROM user WHERE username = '${username}'`
    const userQueryResponse = await db.get(userQuery)
    if (userQueryResponse === undefined) {
      const encriptedPassoword = await bcrypt.hash(password, 10)
      const newUserQuery = `INSERT INTO user (name,username,password,gender)
      VALUES 
      ('${name}','${username}','${encriptedPassoword}','${gender}');`
      await db.run(newUserQuery)
      response.status(200)
      response.send('User created successfully')
    } else {
      response.status(400)
      response.send('User already exists')
    }
  }
})

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  console.log(username, password)
  const dbUser = await db.get(selectUserQuery)
  console.log(dbUser)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched === true) {
      const jwtToken = jwt.sign(dbUser, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

const authenticateToken = (request, response, next) => {
  const {tweet} = request.body
  const {tweetId} = request.params
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.payload = payload
        request.tweetId = tweetId
        request.tweet = tweet
        next()
      }
    })
  }
}

app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {payload} = request
  const {user_id, name, username, gender} = payload
  const getTweetFeedQuery = `
  SELECT username, tweet, 
  date_time AS dateTime
  FROM follower INNER JOIN 
  tweet 
  ON 
  follower.following_user_id = tweet.user_id 
  INNER JOIN user ON user.user_id = follower.following_user_id
  WHERE 
  follower.follower_user_id = ${user_id}
  ORDER BY 
  date_time DESC 
  LIMIT 4 ;`
  const tweetFeedArray = await db.all(getTweetFeedQuery)
  response.send(tweetFeedArray)
})

app.get('/user/following/', authenticateToken, async (request, response) => {
  const {payload} = request
  const {user_id, name, username} = payload

  const userFollowsQuery = `
  SELECT name 
  FROM 
  user INNER JOIN follower
  ON user.user_id = follower.following_user_id
  WHERE 
  follower.follower_user_id = ${user_id};`
  const userFollowsArray = await db.all(userFollowsQuery)
  response.send(userFollowsArray)
})
// API-5
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {payload} = request
  const {user_id, name, username} = payload
  const userFollowersQuery = `
  SELECT name 
  FROM 
  user INNER JOIN follower 
  ON user.user_id = follower.follower_user_id
  WHERE 
  follower.following_user_id = ${user_id};`
  const userFollowersArray = await db.all(userFollowersQuery)
  response.send(userFollowersArray)
})
//API-6
app.get('/tweets/:tweetId', authenticateToken, async (request, response) => {
  const {tweetId} = request
  const {payload} = request
  const {user_id, name, username, gender} = payload
  console.log(name, tweetId)
  const tweetsQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`
  const tweetsResult = await db.get(tweetsQuery)
  //   response.send(tweetsResult);

  const userFollowersQuery = `
        SELECT 
           *

        FROM  follower INNER JOIN user ON user.user_id = follower.following_user_id 
       
        WHERE 
            follower.follower_user_id  = ${user_id} 
    ;`

  const userFollowers = await db.all(userFollowersQuery)
  // response.send(userFollowers);

  if (
    userFollowers.some(item => item.following_user_id === tweetsResult.user_id)
  ) {
    const getTweetDetailsQuery = `
            SELECT
                tweet,
                COUNT(DISTINCT(like.like_id)) AS likes,
                COUNT(DISTINCT(reply.reply_id)) AS replies,
                tweet.date_time AS dateTime
            FROM 
                tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
            WHERE 
                tweet.tweet_id = ${tweetId} AND tweet.user_id=${userFollowers[0].user_id}
            ;`

    const tweetDetails = await db.get(getTweetDetailsQuery)
    response.send(tweetDetails)
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})
//API-7
app.get(
  '/tweets/:tweetId/likes',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request
    const {payload} = request
    const {user_id, name, username, gender} = payload
    console.log(name, tweetId)
    const getLikedUsersQuery = `
            SELECT 
               *
            FROM 
                follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id 
                INNER JOIN user ON user.user_id = like.user_id
            WHERE 
            tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id}
    ;`
    const likedUsers = await db.all(getLikedUsersQuery)
    console.log(likedUsers)
    if (likedUsers.length !== 0) {
      let likes = []
      const getNamesArray = likedUsers => {
        for (let item of likedUsers) {
          likes.push(item.username)
        }
      }
      getNamesArray(likedUsers)
      response.send({likes})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request
    const {payload} = request
    const {user_id, name, username, gender} = payload
    const getRepliesQuery = `
  SELECT * FROM 
  follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
  INNER JOIN user ON user.user_id = reply.user_id
  WHERE 
  tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`
    const repliedUsers = await db.all(getRepliesQuery)
    if (repliedUsers.length !== 0) {
      let replies = []
      const getNamesArray = repliedUsers => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          }
          replies.push(object)
        }
      }
      getNamesArray(repliedUsers)
      response.send({replies})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {payload} = request
  const {user_id, name, username, gender} = payload
  const getTweetsDetailsQuery = `
  SELECT tweet.tweet AS tweet,
  COUNT(DISTINCT(like.like_id)) AS likes,
  COUNT(DISTINCT(reply.reply_id)) AS replies,
  tweet.date_time AS dateTime
  FROM 
      user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
      WHERE 
      user.user_id = ${user_id}
  GROUP BY 
      tweet.tweet_id;`
  const tweetDetails = await db.all(getTweetsDetailsQuery)
  response.send(tweetDetails)
})

app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {tweet} = request
  const {tweetId} = request
  const {payload} = request
  const {user_id, name, username, gender} = payload
  console.log(tweet)
  const postTweetQuery = `
  INSERT INTO
  tweet (tweet, user_id)
  VALUES(
    '${tweet}',
    ${user_id}
  );`
  await db.run(postTweetQuery)
  response.send('Created a Tweet')
})

app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request
    const {payload} = request

    const {user_id, name, username, gender} = payload
    const selectUserQuery = `
  SELECT * FROM tweet WHERE tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};`
    const tweetUser = await db.all(selectUserQuery)

    if (tweetUser.length !== 0) {
      const deleteTweetQuery = `
    DELETE FROM tweet 
    WHERE 
    tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};`
      await db.run(deleteTweetQuery)
      response.send('Tweet Removed')
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

module.exports = app
