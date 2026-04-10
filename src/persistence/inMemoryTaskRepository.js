class InMemoryTaskRepository {
  constructor(seedTasks = []) {
    this.tasks = new Map(seedTasks.map((task) => [task.id, { ...task }]));
  }

  listByUserId(userId) {
    return [...this.tasks.values()]
      .filter((task) => task.userId === userId)
      .sort((left, right) => {
        if (left.completed !== right.completed) {
          return left.completed ? 1 : -1;
        }

        return right.createdAt.localeCompare(left.createdAt);
      })
      .map((task) => ({ ...task }));
  }

  create(task) {
    this.tasks.set(task.id, { ...task });
    return { ...task };
  }

  findById(id) {
    const task = this.tasks.get(id);
    return task ? { ...task } : null;
  }

  update(task) {
    this.tasks.set(task.id, { ...task });
    return { ...task };
  }

  delete(id) {
    return this.tasks.delete(id);
  }
}

module.exports = {
  InMemoryTaskRepository,
};
