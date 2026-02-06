<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Task;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class TaskController extends Controller
{
    public function index(Request $request)
    {
        $query = Task::query();
        $search = trim((string) $request->query('search', ''));
        $status = (string) $request->query('status', '');

        if ($search !== '') {
            $query->where(function ($inner) use ($search) {
                $inner->where('title', 'like', '%' . $search . '%')
                    ->orWhere('description', 'like', '%' . $search . '%');
            });
        }

        if (in_array($status, ['todo', 'doing', 'done'], true)) {
            $query->where('status', $status);
        }

        return $query->orderByDesc('created_at')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:1000'],
            'status' => ['required', 'string', 'in:todo,doing,done'],
        ]);

        $task = Task::create($data);

        return response()->json($task, Response::HTTP_CREATED);
    }

    public function show(Task $task)
    {
        return $task;
    }

    public function update(Request $request, Task $task)
    {
        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:120'],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'status' => ['sometimes', 'string', 'in:todo,doing,done'],
        ]);

        $task->fill($data);
        $task->save();

        return response()->json($task);
    }

    public function destroy(Task $task)
    {
        $task->delete();

        return response()->noContent();
    }
}
