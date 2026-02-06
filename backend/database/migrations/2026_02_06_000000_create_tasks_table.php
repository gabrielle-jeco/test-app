<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->string('title', 120);
            $table->text('description')->nullable();
            $table->string('status', 20)->default('todo');
            $table->timestamps();

            $table->index(['status', 'created_at']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('tasks');
    }
};
