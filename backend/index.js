import express from 'express'
import cors from 'cors'
import 'dotenv/config'

const app = express()
app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
    res.json({ message: 'Save a Life API funcionando' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`))