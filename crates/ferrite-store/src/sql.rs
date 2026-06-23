use rusqlite::types::ToSql;

/// Accumulates `column = ?N` fragments and their bound values for dynamically built
/// UPDATE/WHERE clauses, keeping positional placeholders in sync with the value list.
#[derive(Default)]
pub(crate) struct ClauseBuilder {
    clauses: Vec<String>,
    params: Vec<Box<dyn ToSql>>,
}

impl ClauseBuilder {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    /// Add a `column = ?N` clause bound to `value`.
    pub(crate) fn push<T: ToSql + 'static>(&mut self, column: &str, value: T) {
        self.clauses
            .push(format!("{column} = ?{}", self.params.len() + 1));
        self.params.push(Box::new(value));
    }

    /// Add a `column = ?N` clause only when `value` is `Some`.
    pub(crate) fn push_opt<T: ToSql + 'static>(&mut self, column: &str, value: Option<T>) {
        if let Some(v) = value {
            self.push(column, v);
        }
    }

    /// Bind a trailing standalone value (e.g. LIMIT/OFFSET/id), returning its 1-based index.
    pub(crate) fn bind<T: ToSql + 'static>(&mut self, value: T) -> usize {
        self.params.push(Box::new(value));
        self.params.len()
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.clauses.is_empty()
    }

    pub(crate) fn join(&self, sep: &str) -> String {
        self.clauses.join(sep)
    }

    pub(crate) fn refs(&self) -> Vec<&dyn ToSql> {
        self.params.iter().map(|p| p.as_ref()).collect()
    }
}
