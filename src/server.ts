#!/usr/bin/env node

import * as readline from 'readline';

interface Task {
  id: number;
  description: string;
  completed: boolean;
}

class TodoApp {
  private tasks: Task[] = [];
  private nextId = 1;
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  private showMenu(): void {
    console.log('\n📝 TypeScript Todo App');
    console.log('======================');
    console.log('1. Add task');
    console.log('2. List tasks');
    console.log('3. Complete task');
    console.log('4. Delete task');
    console.log('5. Exit');
    console.log('');
  }

  private addTask(description: string): void {
    const task: Task = {
      id: this.nextId++,
      description,
      completed: false
    };
    this.tasks.push(task);
    console.log(`✅ Task added: "${description}"`);
  }

  private listTasks(): void {
    if (this.tasks.length === 0) {
      console.log('\nNo tasks yet. Add some tasks to get started!');
      return;
    }

    console.log('\nYour Tasks:');
    console.log('-----------');
    this.tasks.forEach(task => {
      const status = task.completed ? '✓' : ' ';
      console.log(`[${status}] ${task.id}. ${task.description}`);
    });
  }

  private completeTask(id: number): void {
    const task = this.tasks.find(t => t.id === id);
    if (task) {
      task.completed = true;
      console.log(`✓ Completed: "${task.description}"`);
    } else {
      console.log('❌ Task not found');
    }
  }

  private deleteTask(id: number): void {
    const index = this.tasks.findIndex(t => t.id === id);
    if (index !== -1) {
      const task = this.tasks.splice(index, 1)[0];
      console.log(`🗑️  Deleted: "${task.description}"`);
    } else {
      console.log('❌ Task not found');
    }
  }

  private prompt(question: string): Promise<string> {
    return new Promise(resolve => {
      this.rl.question(question, resolve);
    });
  }

  public async run(): Promise<void> {
    console.log('\n🚀 Welcome to TypeScript Todo App!');
    console.log('Running on macOS\n');

    while (true) {
      this.showMenu();
      const choice = await this.prompt('Choose an option (1-5): ');

      switch (choice.trim()) {
        case '1':
          const description = await this.prompt('Enter task description: ');
          if (description.trim()) {
            this.addTask(description.trim());
          }
          break;

        case '2':
          this.listTasks();
          break;

        case '3':
          const completeId = await this.prompt('Enter task ID to complete: ');
          this.completeTask(parseInt(completeId));
          break;

        case '4':
          const deleteId = await this.prompt('Enter task ID to delete: ');
          this.deleteTask(parseInt(deleteId));
          break;

        case '5':
          console.log('\n👋 Goodbye!');
          this.rl.close();
          process.exit(0);

        default:
          console.log('❌ Invalid option. Please choose 1-5.');
      }
    }
  }
}

// Start the app
const app = new TodoApp();
app.run().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
