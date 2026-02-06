<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Task;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class TaskController extends Controller
{
    public function index(Request $request)
    {
        $query = Task::query()->where('user_id', $request->user()->id);
        $this->applyFilters($request, $query);

        $sort = (string) $request->query('sort', 'newest');
        $direction = $sort === 'oldest' ? 'asc' : 'desc';

        $perPage = (int) $request->query('per_page', 8);
        $perPage = max(5, min($perPage, 200));

        $paginated = $query
            ->orderBy('created_at', $direction)
            ->paginate($perPage)
            ->appends($request->query());

        return response()->json([
            'data' => $paginated->items(),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
                'from' => $paginated->firstItem(),
                'to' => $paginated->lastItem(),
            ],
        ]);
    }

    public function stats(Request $request)
    {
        $query = Task::query()->where('user_id', $request->user()->id);
        $this->applyFilters($request, $query);

        $total = (clone $query)->count();
        $todo = (clone $query)->where('status', 'todo')->count();
        $doing = (clone $query)->where('status', 'doing')->count();
        $done = (clone $query)->where('status', 'done')->count();

        return response()->json([
            'total' => $total,
            'todo' => $todo,
            'doing' => $doing,
            'done' => $done,
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:1000'],
            'status' => ['required', 'string', 'in:todo,doing,done'],
        ]);

        $task = new Task($data);
        $task->user()->associate($request->user());
        $task->save();

        return response()->json($task, Response::HTTP_CREATED);
    }

    public function show(Request $request, Task $task)
    {
        $this->authorizeTask($request, $task);
        return $task;
    }

    public function update(Request $request, Task $task)
    {
        $this->authorizeTask($request, $task);
        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:120'],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'status' => ['sometimes', 'string', 'in:todo,doing,done'],
        ]);

        $task->fill($data);
        $task->save();

        return response()->json($task);
    }

    public function destroy(Request $request, Task $task)
    {
        $this->authorizeTask($request, $task);
        $task->delete();

        return response()->noContent();
    }

    private function applyFilters(Request $request, Builder $query): void
    {
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
    }

    private function authorizeTask(Request $request, Task $task): void
    {
        if ($task->user_id !== $request->user()->id) {
            abort(404);
        }
    }
}
