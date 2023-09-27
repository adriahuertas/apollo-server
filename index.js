import { ApolloServer } from "@apollo/server"

import { startStandaloneServer } from "@apollo/server/standalone"

import { v1 as uuid } from "uuid"

import mongoose from "mongoose"

import "dotenv/config"

import Book from "./models/book.js"
import Author from "./models/author.js"

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
  }

  type Mutation {
    addBook(
      title: String!
      author: String!
      published: Int!
      genres: [String!]!
    ): Book
    editAuthor(name: String!, setBornTo: Int!): Author
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
        return Book.find({})
      }
      if (args.author && !args.genre) {
        return Book.find({ author: args.author })
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
  },
  Author: {
    bookCount: async (author) => {
      return Book.find({ author: author.id }).countDocuments()
    },
  },
  Mutation: {
    addBook: async (root, args) => {
      const author = await Author.findOne({ name: args.author })
      if (!author) {
        // Create author
        const author = new Author({ name: args.author, id: uuid() })
        try {
          await author.save()
        } catch (error) {
          throw new UserInputError(error.message, {
            invalidArgs: args,
          })
        }
      }
      const book = new Book({ ...args, author: author.id })
      try {
        await book.save()
      } catch (error) {
        throw new UserInputError(error.message, {
          invalidArgs: args,
        })
      }
      return book
    },
    editAuthor: async (root, args) => {
      const author = await Book.findOne({ name: args.name })
      if (!author) {
        return null
      }
      const updatedAuthor = { ...author, born: args.setBornTo }

      try {
        await updatedAuthor.save()
      } catch (error) {
        throw new UserInputError(error.message, {
          invalidArgs: args,
        })
      }
      return updatedAuthor
    },
  },
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
})

startStandaloneServer(server, {
  listen: { port: 4000 },
}).then(({ url }) => {
  console.log(`Server ready at ${url}`)
})
