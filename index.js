import { ApolloServer } from "@apollo/server"
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer"
import { expressMiddleware } from "@apollo/server/express4"
import { GraphQLError } from "graphql"
import { makeExecutableSchema } from "@graphql-tools/schema"
import { PubSub } from "graphql-subscriptions"
import { UserInputError } from "apollo-server-errors"
import { useServer } from "graphql-ws/lib/use/ws"
import { WebSocketServer } from "ws"

import { v1 as uuid } from "uuid"
import cors from "cors"
import express from "express"
import http from "http"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"

import "dotenv/config"

import Author from "./models/author.js"
import Book from "./models/book.js"
import User from "./models/user.js"

import typeDefs from "./schema.js"
import resolvers from "./resolvers.js"

const MONGODB_URI = process.env.MONGODB_URI

const pubsub = new PubSub()

console.log("connecting to", MONGODB_URI)

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("connected to MongoDB")
  })
  .catch((error) => {
    console.log("error connecting to MongoDB:", error.message)
  })

const start = async () => {
  const app = express()
  const httpServer = http.createServer(app)

  const wsServer = new WebSocketServer({
    server: httpServer,
    path: "/",
  })

  const schema = makeExecutableSchema({ typeDefs, resolvers })
  const serverCleanup = useServer({ schema }, wsServer)

  const server = new ApolloServer({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose()
            },
          }
        },
      },
    ],
  })

  await server.start()

  app.use(
    "/",
    cors(),
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => {
        const auth = req ? req.headers.authorization : null
        if (auth && auth.startsWith("Bearer ")) {
          const decodedToken = jwt.verify(
            auth.substring(7),
            process.env.JWT_SECRET
          )
          const currentUser = await User.findById(decodedToken.id).populate(
            "friends"
          )
          return { currentUser }
        }
      },
    })
  )

  const PORT = 4000

  httpServer.listen(PORT, () =>
    console.log(`Server is now running on http://localhost:${PORT}`)
  )
}

start()
