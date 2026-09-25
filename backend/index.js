import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import { supabase } from './config/supabase.js'

const app = express()
app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
    res.json({ message: 'Save a Life API funcionando' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`))


app.get('/api/test/supabase', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('tipos_establecimiento')
            .select('*')

        if (error) {
            return res.status(500).json({
                conectado: false,
                error: error.message
            })
        }

        res.json({
            conectado: true,
            mensaje: 'Express está conectado correctamente con Supabase',
            datos: data
        })

    } catch (error) {
        res.status(500).json({
            conectado: false,
            error: error.message
        })
    }
})