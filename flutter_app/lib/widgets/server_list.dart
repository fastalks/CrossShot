import 'package:flutter/material.dart';

class ServerList extends StatelessWidget {
  final List<Map<String, String>> servers;
  final void Function(Map<String, String> server)? onSelect;

  const ServerList({super.key, required this.servers, this.onSelect});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.all(16),
          child: Text(
            '发现的PC端服务',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
        Expanded(
          child: servers.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.search_off, size: 64, color: Colors.grey),
                      SizedBox(height: 16),
                      Text(
                        '未发现PC端服务',
                        style: TextStyle(color: Colors.grey, fontSize: 16),
                      ),
                      SizedBox(height: 8),
                      Text(
                        '请确保PC端应用已启动',
                        style: TextStyle(color: Colors.grey, fontSize: 14),
                      ),
                    ],
                  ),
                )
              : ListView.builder(
                  itemCount: servers.length,
                  itemBuilder: (context, index) {
                    final server = servers[index];
                    final isSelectable = onSelect != null;
                    return Card(
                      margin: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      child: ListTile(
                        leading: const Icon(Icons.computer, color: Colors.blue),
                        title: Text(server['name'] ?? 'Unknown'),
                        subtitle: Text('${server['host']}:${server['port']}'),
                        trailing: Icon(
                          Icons.check_circle,
                          color: isSelectable ? Colors.green : Colors.grey,
                        ),
                        onTap: isSelectable
                            ? () {
                                onSelect?.call(server);
                              }
                            : null,
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}
