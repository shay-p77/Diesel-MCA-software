import mongoose, { Schema } from 'mongoose'

export interface IUser {
  _id: string
  email: string
  password: string
  name: string
  role: 'admin' | 'user'
  createdAt: string
  updatedAt: string
  createdBy?: string
  invitationToken?: string | null
  invitationExpiry?: Date | null
  passwordSetup: boolean
}

const UserSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: false, // Not required initially (set during invitation)
    default: null,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user',
  },
  createdBy: {
    type: String,
    default: null,
  },
  invitationToken: {
    type: String,
    default: null,
  },
  invitationExpiry: {
    type: Date,
    default: null,
  },
  passwordSetup: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
  toJSON: {
    transform: (_doc, ret) => {
      ret.id = ret._id.toString()
      delete ret._id
      delete ret.__v
      delete ret.password // Never expose password in JSON
      delete ret.invitationToken // Never expose invitation token
      return ret
    }
  }
})

// Indexes
UserSchema.index({ email: 1 })

export const UserModel = mongoose.model('User', UserSchema)
