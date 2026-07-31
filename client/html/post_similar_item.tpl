<li data-post-id='<%= ctx.post.id %>'>
    <a class='thumbnail-wrapper <%= ctx.post.tags.length > 0 ? "tags" : "no-tags" %>'
            title='@<%- ctx.post.id %> (<%- ctx.post.type %>)&#10;Similarity: <%- ctx.distance.toFixed(2) %>'
            href='<%= ctx.canViewPosts ? ctx.getPostUrl(ctx.post.id) : "" %>'>
        <%= ctx.makeThumbnail(ctx.post.thumbnailUrl) %>
        <span class='type' data-type='<%- ctx.post.type %>'>
            <% if (ctx.post.type == 'video' || ctx.post.type == 'flash' || ctx.post.type == 'animation') { %>
                <span class='icon'><i class='fa fa-film'></i></span>
            <% } else { %>
                <%- ctx.post.type %>
            <% } %>
        </span>
    </a>
</li>
