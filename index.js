import { ApolloServer } from "@apollo/server"
import { GraphQLError } from "graphql"
import { startStandaloneServer } from "@apollo/server/standalone"
import { UserInputError } from "apollo-server-errors"

import { v1 as uuid } from "uuid"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"

import "dotenv/config"

import Author from "./models/author.js"
import Book from "./models/book.js"
import User from "./models/user.js"

const MONGODB_URI = process.env.MONGODB_URI

console.log("connecting to", MONGODB_URI)

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("connected to MongoDB")
  })
  .catch((error) => {
    console.log("error connecting to MongoDB:", error.message)
  })

const typeDefs = `
type User {
  username: String!
  favoriteGenre: String
  id: ID!
}

type Token {
  value: String!
}

type Book {
  title: String!
  author: Author!
  published: Int!
  genres: [String!]!
  id: ID!
}

type Author {
  name: String!
  id: ID!
  born: Int
  bookCount: Int!
}

  type Query {
    dummy: Int
    bookCount: Int!
    authorCount: Int!
    allAuthors: [Author!]!
    allBooks(author: String, genre: String): [Book!]!
    allFavoriteBooks: [Book!]!
    me: User
  }

  type Mutation {
    addBook(
      title: String!
      author: String!
      published: Int!
      genres: [String!]!
    ): Book

    editAuthor(name: String!, setBornTo: Int!): Author

    createUser(
      username: String!
      favoriteGenre: String
    ): User

    login(
      username: String!
      password: String!
    ): Token
  }
`

const resolvers = {
  Query: {
    dummy: () => 0,
    bookCount: async () => Book.find({}).countDocuments(),
    authorCount: async () => Author.find({}).countDocuments(),
    allAuthors: async () => Author.find({}),
    allBooks: async (root, args) => {
      if (!args.author && !args.genre) {
        return Book.find({}).populate("author")
      }
      if (args.author && !args.genre) {
        return Book.find({ author: args.author }).populate("author")
      }
      if (!args.author && args.genre) {
        return Book.find({ genres: { $in: [args.genre] } })
      }
      if (args.author && args.genre) {
        return Book.find({
          author: args.author,
          genres: { $in: [args.genre] },
        })
      }
    },
    allFavoriteBooks: async (root, args, context) => {
      const currentUser = context.currentUser
      console.log(currentUser)
      if (!currentUser) {
        throw new GraphQLError("Not authenticated", {
          extensions: {
            code: "BAD_USER_INPUT",
          },
        })
      }

      return Book.find({
        genres: { $in: [currentUser.favoriteGenre] },
      }).populate("author")
    },
    me: (root, args, context) => {
      console.log("Running me query")
      return context.currentUser
    },
  },

  Author: {
    bookCount: async (author) => {
      return Book.find({ author: author.id }).countDocuments()
    },
  },

  Mutation: {
    addBook: async (root, args, context) => {
      const currentUser = context.currentUser

      if (!currentUser) {
        throw new GraphQLError("Not authenticated", {
          extensions: {
            code: "BAD_USER_INPUT",
          },
        })
      }
      try {
        let author = await Author.findOne({ name: args.author })

        // If the author doesn't exist, create a new author
        if (!author) {
          author = new Author({ name: args.author })
          await author.save()
        }

        const book = new Book({ ...args, author: author.id })
        const savedBook = await book.save()
        return savedBook.populate("author")
      } catch (error) {
        throw new UserInputError(error.message, {
          invalidArgs: args,
        })
      }
    },
    editAuthor: async (root, args, context) => {
      const currentUser = context.currentUser

      if (!currentUser) {
        throw new GraphQLError("Not authenticated", {
          extensions: {
            code: "BAD_USER_INPUT",
          },
        })
      }

      const author = await Author.findOne({ name: args.name })
      if (!author) {
        return null
      }
      author.born = args.setBornTo

      try {
        await author.save()
      } catch (error) {
        throw new UserInputError(error.message, {
          invalidArgs: args,
        })
      }
      return author
    },

    createUser: async (root, args) => {
      const user = new User({
        username: args.username,
        favoriteGenre: args.favoriteGenre,
      })
      return user.save().catch((error) => {
        throw new GraphQLError("Creating the user failed", {
          extensions: {
            code: "BAD_USER_INPUT",
            invalidArgs: args.name,
            error,
          },
        })
      })
    },

    login: async (root, args) => {
      const user = await User.findOne({ username: args.username })

      if (!user || args.password !== "secret") {
        throw new GraphQLError("Wrong credentials", {
          extensions: {
            code: "BAD_USER_INPUT",
          },
        })
      }

      const userForToken = {
        username: user.username,
        id: user._id,
      }

      return { value: jwt.sign(userForToken, process.env.JWT_SECRET) }
    },
  },
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
})

startStandaloneServer(server, {
  listen: { port: 4000 },
  context: async ({ req, res }) => {
    const auth = req ? req.headers.authorization : null

    if (auth && auth.startsWith("bearer ")) {
      const decodedToken = jwt.verify(auth.substring(7), process.env.JWT_SECRET)
      const currentUser = await User.findById(decodedToken.id)
      return { currentUser }
    }
  },
}).then(({ url }) => {
  console.log(`Server ready at ${url}`)
})
