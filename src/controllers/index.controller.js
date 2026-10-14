const getRoot = (req, res) => {
  res.json({
    ok: true,
    message: 'API Asistencia - Tecnológico Américo Vespucio funcionando',
  });
};

module.exports = { getRoot };
